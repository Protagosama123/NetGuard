import { eq, and, count } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users, type UserRole } from '../../db/schema.ts';
import { AuditService } from '../audit/audit.service.ts';

export class UsersService {
  /**
   * List all registered users (omitting password hashes)
   */
  static async listUsers() {
    return db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(users.id);
  }

  /**
   * Update a user's role (ADMIN only)
   */
  static async updateUserRole(
    targetUserId: number,
    newRole: UserRole,
    requestingAdminId: number
  ) {
    const validRoles: UserRole[] = ['ADMIN', 'ANALYST', 'VIEWER'];
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role. Allowed roles are: ${validRoles.join(', ')}`);
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      throw new Error('User not found');
    }

    // Safety guardrail: Prevent an admin from demoting themselves if they are the sole admin
    if (targetUserId === requestingAdminId && newRole !== 'ADMIN') {
      const [adminCountResult] = await db
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));

      if (Number(adminCountResult?.total || 0) <= 1) {
        throw new Error('Cannot demote yourself: at least one active ADMIN must exist in the system.');
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        role: newRole,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUserId))
      .returning();

    await AuditService.logAction({
      actorId: requestingAdminId,
      action: 'USER_ROLE_CHANGED',
      targetEntity: 'user',
      targetId: targetUserId,
      details: {
        targetEmail: targetUser.email,
        previousRole: targetUser.role,
        newRole,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Update a user's active status (activate/deactivate) (ADMIN only)
   */
  static async updateUserStatus(
    targetUserId: number,
    isActive: boolean,
    requestingAdminId: number
  ) {
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      throw new Error('User not found');
    }

    // Safety guardrail: Prevent an admin from deactivating themselves if they are the sole active admin
    if (targetUserId === requestingAdminId && !isActive) {
      const [adminCountResult] = await db
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));

      if (Number(adminCountResult?.total || 0) <= 1) {
        throw new Error('Cannot deactivate your own account: at least one active ADMIN must exist in the system.');
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUserId))
      .returning();

    await AuditService.logAction({
      actorId: requestingAdminId,
      action: 'USER_STATUS_CHANGED',
      targetEntity: 'user',
      targetId: targetUserId,
      details: {
        targetEmail: targetUser.email,
        previousStatus: targetUser.isActive,
        newStatus: isActive,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
