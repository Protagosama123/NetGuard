import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AlertsService } from './alerts.service.ts';
import { requireAuth, requireRole } from '../middleware/auth.middleware.ts';

export const alertsRouter = Router();

// Zod schemas
const AlertStatusUpdateSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'], {
    message: "Status must be one of: 'NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'",
  }),
});

const CreateOrPromoteAlertSchema = z.object({
  securityEventId: z.number().int().positive().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  sourceIp: z.string().min(1).optional(),
  destinationIp: z.string().min(1).optional(),
  signatureId: z.number().int().positive().optional(),
});

/**
 * GET /api/alerts
 * List alerts with filtering and pagination (Accessible to any authenticated user)
 */
alertsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { page, limit, status, severity, sourceIp, destinationIp, search } = req.query;

    const result = await AlertsService.queryAlerts({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: status ? (String(status) as any) : undefined,
      severity: severity ? (String(severity) as any) : undefined,
      sourceIp: sourceIp ? String(sourceIp) : undefined,
      destinationIp: destinationIp ? String(destinationIp) : undefined,
      search: search ? String(search) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.alerts,
      pagination: result.pagination,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query alerts';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/alerts/stats
 * Aggregate alert counts by status and severity
 */
alertsRouter.get('/stats', requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await AlertsService.getAlertStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve alert metrics';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/alerts/:id
 * Retrieve single alert details and linked raw telemetry
 */
alertsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid alert ID' });
      return;
    }

    const alert = await AlertsService.getAlertById(id);
    if (!alert) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: alert,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch alert';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/alerts
 * Promote a security event or manually create an alert (ADMIN or ANALYST only)
 */
alertsRouter.post('/', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const parseResult = CreateOrPromoteAlertSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
      });
      return;
    }

    const data = parseResult.data;

    // Promotion flow
    if (data.securityEventId) {
      const promoted = await AlertsService.promoteEvent(
        data.securityEventId,
        data.title,
        data.severity,
        data.description
      );
      res.status(201).json({
        success: true,
        data: promoted,
      });
      return;
    }

    // Direct manual alert creation flow
    if (!data.title || !data.severity || !data.sourceIp || !data.destinationIp || !data.signatureId) {
      res.status(400).json({
        success: false,
        error: 'Manual alert requires title, severity, sourceIp, destinationIp, and signatureId.',
      });
      return;
    }

    const { db } = await import('../../db/index.ts');
    const { alerts } = await import('../../db/schema.ts');

    const [created] = await db
      .insert(alerts)
      .values({
        title: data.title.trim(),
        description: data.description?.trim() || null,
        severity: data.severity,
        status: 'NEW',
        sourceIp: data.sourceIp.trim(),
        destinationIp: data.destinationIp.trim(),
        signatureId: data.signatureId,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create or promote alert';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/alerts/:id/status
 * Transition alert status (ADMIN or ANALYST only)
 */
alertsRouter.patch(
  '/:id/status',
  requireAuth,
  requireRole('ADMIN', 'ANALYST'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid alert ID' });
        return;
      }

      const parseResult = AlertStatusUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: parseResult.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const updated = await AlertsService.updateAlertStatus(id, parseResult.data.status);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update alert status';
      res.status(400).json({ success: false, error: message });
    }
  }
);
