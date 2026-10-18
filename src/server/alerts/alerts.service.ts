import { eq, and, desc, count, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  alerts,
  securityEvents,
  type Alert,
  type NewAlert,
  type AlertSeverity,
  type AlertStatus,
  type SecurityEvent,
} from '../../db/schema.ts';
import { RealtimeGateway } from '../realtime/gateway.ts';

export interface AlertQueryFilter {
  page?: number;
  limit?: number;
  status?: AlertStatus;
  severity?: AlertSeverity;
  sourceIp?: string;
  destinationIp?: string;
  search?: string;
}

export interface AlertStats {
  total: number;
  byStatus: {
    new: number;
    inProgress: number;
    resolved: number;
    dismissed: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export class AlertsService {
  /**
   * Evaluates valid state transitions according to NetGuard V1 specification
   */
  static isValidStatusTransition(currentStatus: AlertStatus, newStatus: AlertStatus): boolean {
    if (currentStatus === newStatus) return true;

    switch (currentStatus) {
      case 'NEW':
        return newStatus === 'IN_PROGRESS' || newStatus === 'DISMISSED';
      case 'IN_PROGRESS':
        return newStatus === 'RESOLVED' || newStatus === 'DISMISSED' || newStatus === 'NEW';
      case 'RESOLVED':
      case 'DISMISSED':
        return newStatus === 'IN_PROGRESS'; // Reopening
      default:
        return false;
    }
  }

  /**
   * Derives initial Alert Severity from Snort Priority and Classification
   */
  static deriveSeverityFromEvent(event: SecurityEvent): AlertSeverity {
    if (event.priority === 1) {
      const cls = (event.classification || '').toLowerCase();
      const msg = (event.signatureMessage || '').toLowerCase();
      if (
        cls.includes('privilege') ||
        cls.includes('exploit') ||
        cls.includes('execution') ||
        cls.includes('rce') ||
        cls.includes('administrator') ||
        msg.includes('root') ||
        msg.includes('exploit') ||
        msg.includes('rce')
      ) {
        return 'CRITICAL';
      }
      return 'HIGH';
    }
    if (event.priority === 2) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Creates an actionable Alert from an eligible Snort Security Event
   */
  static async createAlertFromEvent(event: SecurityEvent): Promise<Alert> {
    const severity = this.deriveSeverityFromEvent(event);
    const newRecord: NewAlert = {
      securityEventId: event.id,
      title: event.signatureMessage,
      description: `Snort Telemetry Detection [SID:${event.signatureId}] - Classification: ${event.classification || 'General Network Event'}`,
      severity,
      status: 'NEW',
      sourceIp: event.sourceIp,
      destinationIp: event.destinationIp,
      signatureId: event.signatureId,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(),
    };

    const [created] = await db.insert(alerts).values(newRecord).returning();
    try {
      RealtimeGateway.getInstance().broadcast('alert:created', created);
    } catch {}
    return created;
  }

  /**
   * Manually promotes any security event to an Alert
   */
  static async promoteEvent(
    securityEventId: number,
    customTitle?: string,
    customSeverity?: AlertSeverity,
    customDescription?: string
  ): Promise<Alert> {
    const [event] = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.id, securityEventId))
      .limit(1);

    if (!event) {
      throw new Error(`Security event with ID ${securityEventId} not found.`);
    }

    const severity = customSeverity || this.deriveSeverityFromEvent(event);
    const title = customTitle?.trim() || event.signatureMessage;
    const description =
      customDescription?.trim() ||
      `Promoted from Snort Event #${event.id} [SID:${event.signatureId}] - ${event.classification || 'Network Detection'}`;

    const newRecord: NewAlert = {
      securityEventId: event.id,
      title,
      description,
      severity,
      status: 'NEW',
      sourceIp: event.sourceIp,
      destinationIp: event.destinationIp,
      signatureId: event.signatureId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [created] = await db.insert(alerts).values(newRecord).returning();
    try {
      RealtimeGateway.getInstance().broadcast('alert:created', created);
    } catch {}
    return created;
  }

  /**
   * Queries alerts with multi-attribute filtering and pagination
   */
  static async queryAlerts(filter: AlertQueryFilter) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filter.status) {
      conditions.push(eq(alerts.status, filter.status));
    }

    if (filter.severity) {
      conditions.push(eq(alerts.severity, filter.severity));
    }

    if (filter.sourceIp) {
      conditions.push(ilike(alerts.sourceIp, `%${filter.sourceIp.trim()}%`));
    }

    if (filter.destinationIp) {
      conditions.push(ilike(alerts.destinationIp, `%${filter.destinationIp.trim()}%`));
    }

    if (filter.search) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(alerts.title, term),
          ilike(alerts.description, term),
          ilike(alerts.sourceIp, term),
          ilike(alerts.destinationIp, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count query
    const [countResult] = await db
      .select({ total: count() })
      .from(alerts)
      .where(whereClause);

    const total = Number(countResult?.total || 0);

    // Records query
    const results = await db
      .select()
      .from(alerts)
      .where(whereClause)
      .orderBy(desc(alerts.createdAt), desc(alerts.id))
      .limit(limit)
      .offset(offset);

    return {
      alerts: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single alert by ID along with source security event
   */
  static async getAlertById(id: number) {
    const [alertRecord] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, id))
      .limit(1);

    if (!alertRecord) {
      return null;
    }

    let sourceEvent: SecurityEvent | null = null;
    if (alertRecord.securityEventId) {
      const [ev] = await db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.id, alertRecord.securityEventId))
        .limit(1);
      sourceEvent = ev || null;
    }

    return {
      ...alertRecord,
      sourceEvent,
    };
  }

  /**
   * Transitions alert status with strict validation rules
   */
  static async updateAlertStatus(id: number, newStatus: AlertStatus): Promise<Alert> {
    const [current] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Alert #${id} not found.`);
    }

    if (!this.isValidStatusTransition(current.status, newStatus)) {
      throw new Error(
        `Invalid alert status transition from '${current.status}' to '${newStatus}'. Permitted transitions: ` +
          (current.status === 'NEW'
            ? 'IN_PROGRESS, DISMISSED'
            : current.status === 'IN_PROGRESS'
            ? 'RESOLVED, DISMISSED, NEW'
            : 'IN_PROGRESS (reopen)')
      );
    }

    const [updated] = await db
      .update(alerts)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, id))
      .returning();

    try {
      RealtimeGateway.getInstance().broadcast('alert:status_changed', {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch {}

    return updated;
  }

  /**
   * Aggregates alert triage metrics
   */
  static async getAlertStats(): Promise<AlertStats> {
    const allAlerts = await db.select().from(alerts);

    const byStatus = {
      new: 0,
      inProgress: 0,
      resolved: 0,
      dismissed: 0,
    };

    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const a of allAlerts) {
      if (a.status === 'NEW') byStatus.new++;
      else if (a.status === 'IN_PROGRESS') byStatus.inProgress++;
      else if (a.status === 'RESOLVED') byStatus.resolved++;
      else if (a.status === 'DISMISSED') byStatus.dismissed++;

      if (a.severity === 'CRITICAL') bySeverity.critical++;
      else if (a.severity === 'HIGH') bySeverity.high++;
      else if (a.severity === 'MEDIUM') bySeverity.medium++;
      else if (a.severity === 'LOW') bySeverity.low++;
    }

    return {
      total: allAlerts.length,
      byStatus,
      bySeverity,
    };
  }
}
