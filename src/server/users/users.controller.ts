import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { UsersService } from './users.service.ts';
import { requireAuth, requireRole } from '../middleware/auth.middleware.ts';
import type { UserRole } from '../../db/schema.ts';

export const usersRouter = Router();

// Protect all user administration routes with authentication and ADMIN role requirement
usersRouter.use(requireAuth, requireRole('ADMIN'));

const UpdateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'ANALYST', 'VIEWER']),
});

const UpdateStatusSchema = z.object({
  isActive: z.boolean(),
});

/**
 * GET /api/users
 * Admin-only: List all users
 */
usersRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const userList = await UsersService.listUsers();
    res.status(200).json({
      success: true,
      data: userList,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve users';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/users/:id/role
 * Admin-only: Update user role (promote/demote)
 */
usersRouter.patch('/:id/role', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, error: 'Invalid user ID' });
      return;
    }

    const parseResult = UpdateRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
      res.status(400).json({ success: false, error: errorMsg });
      return;
    }

    const adminId = req.user!.id;
    const updatedUser = await UsersService.updateUserRole(
      userId,
      parseResult.data.role as UserRole,
      adminId
    );

    res.status(200).json({
      success: true,
      data: updatedUser,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update user role';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/users/:id/status
 * Admin-only: Toggle user active status
 */
usersRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ success: false, error: 'Invalid user ID' });
      return;
    }

    const parseResult = UpdateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
      res.status(400).json({ success: false, error: errorMsg });
      return;
    }

    const adminId = req.user!.id;
    const updatedUser = await UsersService.updateUserStatus(
      userId,
      parseResult.data.isActive,
      adminId
    );

    res.status(200).json({
      success: true,
      data: updatedUser,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update user status';
    res.status(400).json({ success: false, error: message });
  }
});
