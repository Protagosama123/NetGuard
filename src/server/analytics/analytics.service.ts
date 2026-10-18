import { eq, and, gte, lte, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  alerts,
  incidents,
  securityEvents,
  type AlertSeverity,
  type AlertStatus,
  type IncidentSeverity,
  type IncidentStatus,
} from '../../db/schema.ts';

export type AnalyticsTimeRange = '24h' | '7d' | '30d';
export type AnalyticsEntityFilter = 'alerts' | 'incidents' | 'all';

export interface AnalyticsSummary {
  timeRange: AnalyticsTimeRange;
  windowStart: string;
  windowEnd: string;
  incidents: {
    total: number;
    active: number;
    unassigned: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
  };
  alerts: {
    total: number;
    open: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
  };
  telemetry: {
    totalEvents: number;
    highPriorityEvents: number;
  };
  mttd: {
    averageSeconds: number | null;
    sampleCount: number;
    status: 'available' | 'insufficient_data';
  };
}

export interface TrendBucket {
  timestamp: string;
  alertsTotal: number;
  alertsCritical: number;
  alertsHigh: number;
  alertsMedium: number;
  alertsLow: number;
  incidentsDeclared: number;
  incidentsResolved: number;
}

export interface AnalyticsTrends {
  timeRange: AnalyticsTimeRange;
  bucketInterval: '1h' | '1d';
  buckets: TrendBucket[];
}

export interface MttdBucket {
  timestamp: string;
  averageSeconds: number;
  count: number;
}

export interface AnalyticsMttdDetails {
  timeRange: AnalyticsTimeRange;
  averageSeconds: number | null;
  medianSeconds: number | null;
  minSeconds: number | null;
  maxSeconds: number | null;
  sampleCount: number;
  status: 'available' | 'insufficient_data';
  buckets: MttdBucket[];
}

export class AnalyticsService {
  /**
   * Computes the window boundaries based on timeRange
   */
  static getTimeWindow(timeRange: AnalyticsTimeRange): { windowStart: Date; windowEnd: Date } {
    const windowEnd = new Date();
    let ms = 24 * 60 * 60 * 1000;
    if (timeRange === '7d') ms = 7 * 24 * 60 * 60 * 1000;
    if (timeRange === '30d') ms = 30 * 24 * 60 * 60 * 1000;
    const windowStart = new Date(windowEnd.getTime() - ms);
    return { windowStart, windowEnd };
  }

  /**
   * Generates uniform bucket start timestamps for continuous time-series series
   */
  static generateBucketTimestamps(timeRange: AnalyticsTimeRange): { timestamps: Date[]; interval: '1h' | '1d' } {
    const now = new Date();
    const timestamps: Date[] = [];

    if (timeRange === '24h') {
      // 24 hourly buckets
      const currentHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));
      for (let i = 23; i >= 0; i--) {
        timestamps.push(new Date(currentHour.getTime() - i * 60 * 60 * 1000));
      }
      return { timestamps, interval: '1h' };
    } else {
      const days = timeRange === '7d' ? 7 : 30;
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      for (let i = days - 1; i >= 0; i--) {
        timestamps.push(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
      }
      return { timestamps, interval: '1d' };
    }
  }

  /**
   * Computes comprehensive SOC summary metrics
   */
  static async getSummary(timeRange: AnalyticsTimeRange = '24h'): Promise<AnalyticsSummary> {
    const { windowStart, windowEnd } = this.getTimeWindow(timeRange);

    // 1. Incidents Metrics
    const allIncidents = await db.select().from(incidents);
    let activeIncidentsCount = 0;
    let unassignedIncidentsCount = 0;

    for (const inc of allIncidents) {
      if (inc.status !== 'CLOSED') {
        activeIncidentsCount++;
        if (!inc.assignedTo) {
          unassignedIncidentsCount++;
        }
      }
    }

    const windowIncidents = allIncidents.filter(
      (inc) => new Date(inc.createdAt) >= windowStart && new Date(inc.createdAt) <= windowEnd
    );

    const incidentsBySeverity: Record<string, number> = {
      sev1: 0,
      sev2: 0,
      sev3: 0,
      sev4: 0,
    };
    const incidentsByStatus: Record<string, number> = {
      open: 0,
      investigating: 0,
      contained: 0,
      resolved: 0,
      closed: 0,
    };

    for (const inc of windowIncidents) {
      const sevKey = inc.severity.toLowerCase();
      const statusKey = inc.status.toLowerCase();
      if (incidentsBySeverity[sevKey] !== undefined) incidentsBySeverity[sevKey]++;
      if (incidentsByStatus[statusKey] !== undefined) incidentsByStatus[statusKey]++;
    }

    // 2. Alerts Metrics
    const allAlerts = await db.select().from(alerts);
    const windowAlerts = allAlerts.filter(
      (al) => new Date(al.createdAt) >= windowStart && new Date(al.createdAt) <= windowEnd
    );

    let openAlertsCount = 0;
    const alertsBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    const alertsByStatus: Record<string, number> = {
      new: 0,
      inProgress: 0,
      resolved: 0,
      dismissed: 0,
    };

    for (const al of windowAlerts) {
      if (al.status === 'NEW' || al.status === 'IN_PROGRESS') {
        openAlertsCount++;
      }
      const sevKey = al.severity.toLowerCase();
      if (alertsBySeverity[sevKey] !== undefined) alertsBySeverity[sevKey]++;

      if (al.status === 'NEW') alertsByStatus.new++;
      else if (al.status === 'IN_PROGRESS') alertsByStatus.inProgress++;
      else if (al.status === 'RESOLVED') alertsByStatus.resolved++;
      else if (al.status === 'DISMISSED') alertsByStatus.dismissed++;
    }

    // 3. Telemetry Metrics
    const allEvents = await db.select().from(securityEvents);
    const windowEvents = allEvents.filter(
      (ev) => new Date(ev.createdAt) >= windowStart && new Date(ev.createdAt) <= windowEnd
    );

    let highPriorityEvents = 0;
    for (const ev of windowEvents) {
      if (ev.priority <= 1) {
        highPriorityEvents++;
      }
    }

    // 4. Mean Time to Detect (MTTD) Calculation
    const eventMap = new Map<number, Date>();
    for (const ev of allEvents) {
      eventMap.set(ev.id, new Date(ev.timestamp));
    }

    let latencySumMs = 0;
    let mttdSamples = 0;

    for (const al of windowAlerts) {
      if (al.securityEventId && eventMap.has(al.securityEventId)) {
        const eventTs = eventMap.get(al.securityEventId)!;
        const alertTs = new Date(al.createdAt);
        const diffMs = alertTs.getTime() - eventTs.getTime();
        if (diffMs >= 0) {
          latencySumMs += diffMs;
          mttdSamples++;
        }
      }
    }

    let averageSeconds: number | null = null;
    let mttdStatus: 'available' | 'insufficient_data' = 'insufficient_data';

    if (mttdSamples > 0) {
      const avgSec = latencySumMs / mttdSamples / 1000;
      averageSeconds = Math.round(avgSec * 10) / 10;
      mttdStatus = 'available';
    }

    return {
      timeRange,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      incidents: {
        total: windowIncidents.length,
        active: activeIncidentsCount,
        unassigned: unassignedIncidentsCount,
        bySeverity: incidentsBySeverity,
        byStatus: incidentsByStatus,
      },
      alerts: {
        total: windowAlerts.length,
        open: openAlertsCount,
        bySeverity: alertsBySeverity,
        byStatus: alertsByStatus,
      },
      telemetry: {
        totalEvents: windowEvents.length,
        highPriorityEvents,
      },
      mttd: {
        averageSeconds,
        sampleCount: mttdSamples,
        status: mttdStatus,
      },
    };
  }

  /**
   * Computes continuous historical time-series trends with interval zero-filling
   */
  static async getTrends(
    timeRange: AnalyticsTimeRange = '24h',
    entity: AnalyticsEntityFilter = 'all'
  ): Promise<AnalyticsTrends> {
    const { timestamps, interval } = this.generateBucketTimestamps(timeRange);
    const bucketDurationMs = interval === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    const allAlerts = await db.select().from(alerts);
    const allIncidents = await db.select().from(incidents);

    const buckets: TrendBucket[] = timestamps.map((bucketStart) => {
      const bucketEnd = new Date(bucketStart.getTime() + bucketDurationMs);

      let alertsTotal = 0;
      let alertsCritical = 0;
      let alertsHigh = 0;
      let alertsMedium = 0;
      let alertsLow = 0;

      if (entity === 'all' || entity === 'alerts') {
        for (const al of allAlerts) {
          const created = new Date(al.createdAt);
          if (created >= bucketStart && created < bucketEnd) {
            alertsTotal++;
            if (al.severity === 'CRITICAL') alertsCritical++;
            else if (al.severity === 'HIGH') alertsHigh++;
            else if (al.severity === 'MEDIUM') alertsMedium++;
            else if (al.severity === 'LOW') alertsLow++;
          }
        }
      }

      let incidentsDeclared = 0;
      let incidentsResolved = 0;

      if (entity === 'all' || entity === 'incidents') {
        for (const inc of allIncidents) {
          const created = new Date(inc.createdAt);
          if (created >= bucketStart && created < bucketEnd) {
            incidentsDeclared++;
          }
          if (inc.resolvedAt) {
            const resolved = new Date(inc.resolvedAt);
            if (resolved >= bucketStart && resolved < bucketEnd) {
              incidentsResolved++;
            }
          }
        }
      }

      return {
        timestamp: bucketStart.toISOString(),
        alertsTotal,
        alertsCritical,
        alertsHigh,
        alertsMedium,
        alertsLow,
        incidentsDeclared,
        incidentsResolved,
      };
    });

    return {
      timeRange,
      bucketInterval: interval,
      buckets,
    };
  }

  /**
   * Computes detailed Mean Time to Detect (MTTD) statistics and distribution
   */
  static async getMttdDetails(timeRange: AnalyticsTimeRange = '24h'): Promise<AnalyticsMttdDetails> {
    const { timestamps, interval } = this.generateBucketTimestamps(timeRange);
    const bucketDurationMs = interval === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const windowStart = timestamps[0];
    const windowEnd = new Date(timestamps[timestamps.length - 1].getTime() + bucketDurationMs);

    const allAlerts = await db.select().from(alerts);
    const allEvents = await db.select().from(securityEvents);

    const eventMap = new Map<number, Date>();
    for (const ev of allEvents) {
      eventMap.set(ev.id, new Date(ev.timestamp));
    }

    const validLatencies: number[] = [];
    const bucketSamples: Map<string, number[]> = new Map();

    for (const b of timestamps) {
      bucketSamples.set(b.toISOString(), []);
    }

    for (const al of allAlerts) {
      const created = new Date(al.createdAt);
      if (created >= windowStart && created < windowEnd && al.securityEventId && eventMap.has(al.securityEventId)) {
        const eventTs = eventMap.get(al.securityEventId)!;
        const diffSec = (created.getTime() - eventTs.getTime()) / 1000;
        if (diffSec >= 0) {
          validLatencies.push(diffSec);

          for (const bStart of timestamps) {
            const bEnd = new Date(bStart.getTime() + bucketDurationMs);
            if (created >= bStart && created < bEnd) {
              bucketSamples.get(bStart.toISOString())!.push(diffSec);
              break;
            }
          }
        }
      }
    }

    if (validLatencies.length === 0) {
      return {
        timeRange,
        averageSeconds: null,
        medianSeconds: null,
        minSeconds: null,
        maxSeconds: null,
        sampleCount: 0,
        status: 'insufficient_data',
        buckets: [],
      };
    }

    validLatencies.sort((a, b) => a - b);
    const sum = validLatencies.reduce((acc, v) => acc + v, 0);
    const avg = sum / validLatencies.length;
    const mid = Math.floor(validLatencies.length / 2);
    const median = validLatencies.length % 2 === 0
      ? (validLatencies[mid - 1] + validLatencies[mid]) / 2
      : validLatencies[mid];

    const mttdBuckets: MttdBucket[] = [];
    for (const [ts, latencies] of bucketSamples.entries()) {
      if (latencies.length > 0) {
        const bAvg = latencies.reduce((acc, v) => acc + v, 0) / latencies.length;
        mttdBuckets.push({
          timestamp: ts,
          averageSeconds: Math.round(bAvg * 10) / 10,
          count: latencies.length,
        });
      }
    }

    return {
      timeRange,
      averageSeconds: Math.round(avg * 10) / 10,
      medianSeconds: Math.round(median * 10) / 10,
      minSeconds: Math.round(validLatencies[0] * 10) / 10,
      maxSeconds: Math.round(validLatencies[validLatencies.length - 1] * 10) / 10,
      sampleCount: validLatencies.length,
      status: 'available',
      buckets: mttdBuckets,
    };
  }

  /**
   * Evaluates operational subsystem health and queue pressure
   */
  static async getSystemHealth(): Promise<SystemHealthData> {
    let dbConnected = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const latestEvents = await db
      .select()
      .from(securityEvents)
      .orderBy(sql`${securityEvents.createdAt} DESC`)
      .limit(1);

    const allEvents = await db.select().from(securityEvents);
    const eventsLastHour = allEvents.filter((e) => new Date(e.createdAt) >= oneHourAgo).length;

    const allIncidents = await db.select().from(incidents);
    const unassignedIncidents = allIncidents.filter((i) => i.status !== 'CLOSED' && !i.assignedTo).length;

    const allAlerts = await db.select().from(alerts);
    const untriagedAlerts = allAlerts.filter((a) => a.status === 'NEW').length;

    const status = dbConnected ? 'HEALTHY' : 'DEGRADED';

    return {
      status,
      database: {
        connected: dbConnected,
        engine: 'PostgreSQL',
      },
      ingestion: {
        lastEventTimestamp: latestEvents.length > 0 ? new Date(latestEvents[0].createdAt).toISOString() : null,
        eventsLastHour,
      },
      queues: {
        unassignedIncidents,
        untriagedAlerts,
      },
      timestamp: now.toISOString(),
    };
  }
}

export interface SystemHealthData {
  status: 'HEALTHY' | 'DEGRADED';
  database: {
    connected: boolean;
    engine: string;
  };
  ingestion: {
    lastEventTimestamp: string | null;
    eventsLastHour: number;
  };
  queues: {
    unassignedIncidents: number;
    untriagedAlerts: number;
  };
  timestamp: string;
}
