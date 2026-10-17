import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { IncidentsService } from './incidents.service.ts';
import { InvestigationsService } from './investigations.service.ts';
import { requireAuth, requireRole } from '../middleware/auth.middleware.ts';

export const incidentsRouter = Router();

// Validation Schemas
const CreateInvestigationEntrySchema = z.object({
  entryType: z.enum(['NOTE', 'ACTION_TAKEN', 'CONTAINMENT', 'EVIDENCE']).default('NOTE'),
  content: z.string().min(1, 'Investigation note/finding content is required'),
});
const CreateIncidentSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']),
  assignedTo: z.number().int().positive().nullable().optional(),
  alertIds: z.array(z.number().int().positive()).optional(),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED']),
  resolutionSummary: z.string().optional(),
});

const LinkAlertsSchema = z.object({
  alertIds: z.array(z.number().int().positive()).min(1, 'At least one alertId is required'),
});

const AssignIncidentSchema = z.object({
  assignedTo: z.number().int().positive().nullable(),
});

const ResolveIncidentSchema = z.object({
  resolutionSummary: z.string().min(5, 'Resolution summary must be at least 5 characters'),
  status: z.enum(['RESOLVED', 'CLOSED']).optional(),
});

/**
 * GET /api/incidents
 * Query incidents with filters and pagination
 */
incidentsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { page, limit, status, severity, assignedTo, search } = req.query;

    const result = await IncidentsService.queryIncidents({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: status ? (String(status) as any) : undefined,
      severity: severity ? (String(severity) as any) : undefined,
      assignedTo: assignedTo !== undefined ? Number(assignedTo) : undefined,
      search: search ? String(search) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.incidents,
      pagination: result.pagination,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query incidents';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/incidents/stats
 * Aggregate incident counts by status and severity
 */
incidentsRouter.get('/stats', requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await IncidentsService.getIncidentStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve incident metrics';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/incidents/:id
 * Retrieve single incident details, assignee profile, and linked alerts
 */
incidentsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID' });
      return;
    }

    const incident = await IncidentsService.getIncidentById(id);
    if (!incident) {
      res.status(404).json({ success: false, error: 'Incident not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch incident';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/incidents
 * Create a new incident with optional initial alerts (ADMIN or ANALYST only)
 */
incidentsRouter.post('/', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const parseResult = CreateIncidentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const result = await IncidentsService.createIncident({
      ...parseResult.data,
      createdBy: req.user?.id,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create incident';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/incidents/:id/status
 * Transition incident status (ADMIN or ANALYST only)
 */
incidentsRouter.patch('/:id/status', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID' });
      return;
    }

    const parseResult = UpdateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const updated = await IncidentsService.updateStatus(
      id,
      parseResult.data.status,
      parseResult.data.resolutionSummary
    );

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update incident status';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/incidents/:id/assign
 * Assign or clear incident assignment (ADMIN or ANALYST only)
 */
incidentsRouter.patch('/:id/assign', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID' });
      return;
    }

    const parseResult = AssignIncidentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    await IncidentsService.assignIncident(id, parseResult.data.assignedTo ?? null);
    const enriched = await IncidentsService.getIncidentById(id);

    res.status(200).json({
      success: true,
      data: enriched,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to assign incident';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/incidents/:id/resolve
 * Formally resolve or close incident with resolution summary (ADMIN or ANALYST only)
 */
incidentsRouter.patch('/:id/resolve', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID' });
      return;
    }

    const parseResult = ResolveIncidentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const targetStatus = parseResult.data.status || 'RESOLVED';
    const updated = await IncidentsService.resolveIncident(
      id,
      parseResult.data.resolutionSummary,
      targetStatus
    );

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve incident';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * POST /api/incidents/:id/alerts
 * Link alerts to an incident (ADMIN or ANALYST only)
 */
incidentsRouter.post('/:id/alerts', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID' });
      return;
    }

    const parseResult = LinkAlertsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const updated = await IncidentsService.linkAlerts(id, parseResult.data.alertIds, req.user?.id);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to link alerts';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/incidents/:id/alerts/:alertId
 * Unlink an alert from an incident (ADMIN or ANALYST only)
 */
incidentsRouter.delete('/:id/alerts/:alertId', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const alertId = Number(req.params.alertId);
    if (isNaN(id) || isNaN(alertId)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID or alert ID' });
      return;
    }

    await IncidentsService.unlinkAlert(id, alertId);
    res.status(200).json({
      success: true,
      message: `Alert #${alertId} unlinked from incident #${id}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to unlink alert';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * GET /api/incidents/:id/investigations
 * Retrieve chronological investigation timeline entries (Any authenticated user)
 */
incidentsRouter.get('/:id/investigations', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID' });
      return;
    }

    const order = req.query.order === 'desc' ? 'desc' : 'asc';
    const entries = await InvestigationsService.getEntriesByIncident(id, order);

    res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve investigation timeline';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * POST /api/incidents/:id/investigations
 * Record an investigation finding/action (ADMIN or ANALYST only)
 */
incidentsRouter.post('/:id/investigations', requireAuth, requireRole('ADMIN', 'ANALYST'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid incident ID' });
      return;
    }

    const parseResult = CreateInvestigationEntrySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const newEntry = await InvestigationsService.addEntry({
      incidentId: id,
      authorId: req.user?.id,
      entryType: parseResult.data.entryType,
      content: parseResult.data.content,
    });

    res.status(201).json({
      success: true,
      data: newEntry,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add investigation entry';
    res.status(400).json({ success: false, error: message });
  }
});

