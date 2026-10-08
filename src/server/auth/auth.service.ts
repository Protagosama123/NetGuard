import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, count } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users, type UserRole, type User } from '../../db/schema.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'netguard-v0-jwt-secret-do-not-use-in-production';
const JWT_EXPIRES_IN = '24h';
const BCRYPT_SALT_ROUNDS = 10;

export interface TokenPayload {
  id: number;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
  };
  token: string;
}

export class AuthService {
  /**
   * Hashes a plaintext password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Compares a plaintext password against a bcrypt hash
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Signs a JWT with user payload
   */
  static signToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Verifies and decodes a JWT token
   */
  static verifyToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  }

  /**
   * Registers a new user.
   * If this is the very first user in the database, grant ADMIN role for bootstrap.
   * Subsequent users receive the default VIEWER role.
   */
  static async register(email: string, passwordPlain: string): Promise<AuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing) {
      throw new Error('A user with this email address already exists');
    }

    // Determine initial role: First user is ADMIN, others default to VIEWER
    const [userCountResult] = await db.select({ total: count() }).from(users);
    const isFirstUser = Number(userCountResult?.total || 0) === 0;
    const initialRole: UserRole = isFirstUser ? 'ADMIN' : 'VIEWER';

    const passwordHash = await this.hashPassword(passwordPlain);

    const [createdUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        role: initialRole,
        isActive: true,
      })
      .returning();

    const token = this.signToken({
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role as UserRole,
    });

    return {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        role: createdUser.role as UserRole,
        isActive: createdUser.isActive,
        createdAt: createdUser.createdAt,
      },
      token,
    };
  }

  /**
   * Authenticates a user with email and password
   */
  static async login(email: string, passwordPlain: string): Promise<AuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();

    const [userRecord] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!userRecord) {
      throw new Error('Invalid email or password');
    }

    if (!userRecord.isActive) {
      throw new Error('User account has been deactivated. Please contact an administrator.');
    }

    const isMatch = await this.comparePassword(passwordPlain, userRecord.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    const token = this.signToken({
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role as UserRole,
    });

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email,
        role: userRecord.role as UserRole,
        isActive: userRecord.isActive,
        createdAt: userRecord.createdAt,
      },
      token,
    };
  }

  /**
   * Retrieves profile details for a given user ID
   */
  static async getProfile(userId: number) {
    const [userRecord] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord) {
      throw new Error('User not found');
    }

    return userRecord;
  }
}
