import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.ts';
import { requireAuth } from '../middleware/auth.middleware.ts';

export const authRouter = Router();

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/register
 * Register a new user
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
      res.status(400).json({ success: false, error: errorMsg });
      return;
    }

    const { email, password } = parseResult.data;
    const result = await AuthService.register(email, password);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * POST /api/auth/login
 * Authenticate existing user and issue JWT
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
      res.status(400).json({ success: false, error: errorMsg });
      return;
    }

    const { email, password } = parseResult.data;
    const result = await AuthService.login(email, password);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(401).json({ success: false, error: message });
  }
});

/**
 * GET /api/auth/me
 * Retrieve currently logged in user profile
 */
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const profile = await AuthService.getProfile(req.user.id);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve profile';
    res.status(404).json({ success: false, error: message });
  }
});
