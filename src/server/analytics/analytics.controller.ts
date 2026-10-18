import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  AnalyticsService,
  type AnalyticsTimeRange,
  type AnalyticsEntityFilter,
} from './analytics.service.ts';
import { requireAuth } from '../middleware/auth.middleware.ts';

export const analyticsRouter = Router();

const SummaryQuerySchema = z.object({
  timeRange: z.enum(['24h', '7d', '30d']).optional().default('24h'),
});

const TrendsQuerySchema = z.object({
  timeRange: z.enum(['24h', '7d', '30d']).optional().default('24h'),
  entity: z.enum(['alerts', 'incidents', 'all']).optional().default('all'),
});

const MttdQuerySchema = z.object({
  timeRange: z.enum(['24h', '7d', '30d']).optional().default('24h'),
});

/**
 * GET /api/analytics/summary
 * Retrieves consolidated SOC metrics and MTTD across specified timeRange
 */
analyticsRouter.get('/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = SummaryQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: `Invalid query parameter 'timeRange'. Allowed values: '24h', '7d', '30d'.`,
      });
      return;
    }

    const summary = await AnalyticsService.getSummary(parseResult.data.timeRange as AnalyticsTimeRange);
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve analytics summary';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/analytics/trends
 * Retrieves continuous time-series trend buckets for alerts and incidents
 */
analyticsRouter.get('/trends', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = TrendsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: `Invalid query parameters. timeRange: ['24h', '7d', '30d'], entity: ['alerts', 'incidents', 'all'].`,
      });
      return;
    }

    const trends = await AnalyticsService.getTrends(
      parseResult.data.timeRange as AnalyticsTimeRange,
      parseResult.data.entity as AnalyticsEntityFilter
    );

    res.status(200).json({
      success: true,
      data: trends,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve analytics trends';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/analytics/mttd
 * Retrieves detailed Mean Time to Detect statistics and distribution
 */
analyticsRouter.get('/mttd', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = MttdQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: `Invalid query parameter 'timeRange'. Allowed values: '24h', '7d', '30d'.`,
      });
      return;
    }

    const mttd = await AnalyticsService.getMttdDetails(parseResult.data.timeRange as AnalyticsTimeRange);
    res.status(200).json({
      success: true,
      data: mttd,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve MTTD analytics';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/analytics/health
 * Evaluates operational subsystem health, database connectivity, and queue pressure
 */
analyticsRouter.get('/health', requireAuth, async (_req: Request, res: Response) => {
  try {
    const health = await AnalyticsService.getSystemHealth();
    res.status(200).json({
      success: true,
      data: health,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to evaluate system health';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});
