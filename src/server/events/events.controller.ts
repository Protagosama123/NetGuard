import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { EventsService } from './events.service.ts';
import { requireAuth, requireRole } from '../middleware/auth.middleware.ts';
import { AuthService } from '../auth/auth.service.ts';

export const eventsRouter = Router();

const INGEST_API_KEY = process.env.INGEST_API_KEY || 'netguard-snort-telemetry-ingest-key';

// Ingestion Payload Schema (Snort alert format)
const IngestEventSchema = z.object({
  timestamp: z.string().optional(),
  generatorId: z.number().int().positive().optional(),
  signatureId: z.number().int().positive({ message: 'Valid Snort signature ID (SID) is required' }),
  signatureRevision: z.number().int().positive().optional(),
  signatureMessage: z.string().min(1, { message: 'Snort signature message is required' }),
  classification: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  protocol: z.string().min(1, { message: 'Network protocol (e.g. TCP, UDP, ICMP) is required' }),
  sourceIp: z.string().min(1, { message: 'Source IP address is required' }),
  sourcePort: z.number().int().min(0).max(65535).optional().nullable(),
  destinationIp: z.string().min(1, { message: 'Destination IP address is required' }),
  destinationPort: z.number().int().min(0).max(65535).optional().nullable(),
  rawPayload: z.string().optional().nullable(),
});

const IngestPayloadSchema = z.union([
  IngestEventSchema,
  z.array(IngestEventSchema),
]);

/**
 * Flexible Ingest Authorization Middleware:
 * Allows either:
 * 1. An authenticated user with ADMIN or ANALYST role (Bearer token)
 * 2. An automated forwarder providing X-Ingest-Key or X-API-Key header
 */
function requireIngestAuth(req: Request, res: Response, next: () => void) {
  const apiKey = req.headers['x-ingest-key'] || req.headers['x-api-key'];
  if (apiKey && apiKey === INGEST_API_KEY) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7).trim();
      const payload = AuthService.verifyToken(token);
      req.user = payload;
      if (payload.role === 'ADMIN' || payload.role === 'ANALYST') {
        return next();
      }
      res.status(403).json({
        success: false,
        error: `Access denied. Role ${payload.role} is not permitted to ingest security events.`,
      });
      return;
    } catch {
      res.status(401).json({ success: false, error: 'Invalid authentication token.' });
      return;
    }
  }

  res.status(401).json({
    success: false,
    error: 'Ingestion unauthorized. Provide Bearer token (ADMIN/ANALYST) or X-Ingest-Key header.',
  });
}

/**
 * POST /api/events/ingest
 * Ingest single or batch Snort security alerts
 */
eventsRouter.post('/ingest', requireIngestAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = IngestPayloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      res.status(400).json({ success: false, error: errorMsg });
      return;
    }

    const payload = parseResult.data;
    if (Array.isArray(payload)) {
      const ingested = await EventsService.ingestBatch(payload as any);
      res.status(201).json({
        success: true,
        count: ingested.length,
        data: ingested,
      });
      return;
    }

    const ingested = await EventsService.ingestEvent(payload as any);
    res.status(201).json({
      success: true,
      data: ingested,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * GET /api/events/stats
 * Telemetry summary for dashboard
 */
eventsRouter.get('/stats', requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await EventsService.getEventStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve telemetry stats';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/events
 * Query security events with filters and pagination
 */
eventsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      priority,
      protocol,
      sourceIp,
      destinationIp,
      signatureId,
      startDate,
      endDate,
      search,
    } = req.query;

    const result = await EventsService.queryEvents({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      priority: priority !== undefined ? Number(priority) : undefined,
      protocol: protocol ? String(protocol) : undefined,
      sourceIp: sourceIp ? String(sourceIp) : undefined,
      destinationIp: destinationIp ? String(destinationIp) : undefined,
      signatureId: signatureId ? Number(signatureId) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      search: search ? String(search) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.events,
      pagination: result.pagination,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query security events';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/events/:id
 * Retrieve individual event details
 */
eventsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid event ID' });
      return;
    }

    const event = await EventsService.getEventById(id);
    if (!event) {
      res.status(404).json({ success: false, error: 'Security event not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: event,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve event';
    res.status(500).json({ success: false, error: message });
  }
});
