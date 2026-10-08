import { eq, and, gte, lte, desc, count, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { securityEvents, type SecurityEvent, type NewSecurityEvent } from '../../db/schema.ts';

export interface IngestEventInput {
  timestamp?: string | Date;
  generatorId?: number;
  signatureId: number;
  signatureRevision?: number;
  signatureMessage: string;
  classification?: string;
  priority?: number;
  protocol: string;
  sourceIp: string;
  sourcePort?: number;
  destinationIp: string;
  destinationPort?: number;
  rawPayload?: string;
}

export interface EventQueryFilter {
  page?: number;
  limit?: number;
  priority?: number;
  protocol?: string;
  sourceIp?: string;
  destinationIp?: string;
  signatureId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface EventStats {
  total: number;
  byPriority: {
    high: number;    // Priority 1
    medium: number;  // Priority 2
    low: number;     // Priority 3
    info: number;    // Priority 4+
  };
  byProtocol: Record<string, number>;
  recentAlerts: SecurityEvent[];
}

export class EventsService {
  /**
   * Ingests a single Snort security telemetry event.
   * "Snort detects. NetGuard manages."
   */
  static async ingestEvent(input: IngestEventInput): Promise<SecurityEvent> {
    const eventTimestamp = input.timestamp ? new Date(input.timestamp) : new Date();
    if (isNaN(eventTimestamp.getTime())) {
      throw new Error('Invalid timestamp format. Must be a valid ISO string or Unix timestamp.');
    }

    const newRecord: NewSecurityEvent = {
      timestamp: eventTimestamp,
      generatorId: input.generatorId ?? 1,
      signatureId: input.signatureId,
      signatureRevision: input.signatureRevision ?? 1,
      signatureMessage: input.signatureMessage.trim(),
      classification: input.classification?.trim() || null,
      priority: input.priority ?? 3,
      protocol: input.protocol.trim().toUpperCase(),
      sourceIp: input.sourceIp.trim(),
      sourcePort: input.sourcePort ?? null,
      destinationIp: input.destinationIp.trim(),
      destinationPort: input.destinationPort ?? null,
      rawPayload: input.rawPayload || null,
    };

    const [createdEvent] = await db.insert(securityEvents).values(newRecord).returning();
    return createdEvent;
  }

  /**
   * Ingests a batch of Snort security events
   */
  static async ingestBatch(inputs: IngestEventInput[]): Promise<SecurityEvent[]> {
    if (!inputs.length) {
      return [];
    }

    const records: NewSecurityEvent[] = inputs.map((input) => {
      const eventTimestamp = input.timestamp ? new Date(input.timestamp) : new Date();
      return {
        timestamp: isNaN(eventTimestamp.getTime()) ? new Date() : eventTimestamp,
        generatorId: input.generatorId ?? 1,
        signatureId: input.signatureId,
        signatureRevision: input.signatureRevision ?? 1,
        signatureMessage: input.signatureMessage.trim(),
        classification: input.classification?.trim() || null,
        priority: input.priority ?? 3,
        protocol: input.protocol.trim().toUpperCase(),
        sourceIp: input.sourceIp.trim(),
        sourcePort: input.sourcePort ?? null,
        destinationIp: input.destinationIp.trim(),
        destinationPort: input.destinationPort ?? null,
        rawPayload: input.rawPayload || null,
      };
    });

    return db.insert(securityEvents).values(records).returning();
  }

  /**
   * Queries security events with filtering and pagination
   */
  static async queryEvents(filter: EventQueryFilter) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filter.priority !== undefined) {
      conditions.push(eq(securityEvents.priority, filter.priority));
    }

    if (filter.protocol) {
      conditions.push(eq(securityEvents.protocol, filter.protocol.trim().toUpperCase()));
    }

    if (filter.sourceIp) {
      conditions.push(ilike(securityEvents.sourceIp, `%${filter.sourceIp.trim()}%`));
    }

    if (filter.destinationIp) {
      conditions.push(ilike(securityEvents.destinationIp, `%${filter.destinationIp.trim()}%`));
    }

    if (filter.signatureId) {
      conditions.push(eq(securityEvents.signatureId, filter.signatureId));
    }

    if (filter.startDate) {
      const start = new Date(filter.startDate);
      if (!isNaN(start.getTime())) {
        conditions.push(gte(securityEvents.timestamp, start));
      }
    }

    if (filter.endDate) {
      const end = new Date(filter.endDate);
      if (!isNaN(end.getTime())) {
        conditions.push(lte(securityEvents.timestamp, end));
      }
    }

    if (filter.search) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(securityEvents.signatureMessage, term),
          ilike(securityEvents.classification, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count query
    const [countResult] = await db
      .select({ total: count() })
      .from(securityEvents)
      .where(whereClause);

    const total = Number(countResult?.total || 0);

    // Records query
    const events = await db
      .select()
      .from(securityEvents)
      .where(whereClause)
      .orderBy(desc(securityEvents.timestamp), desc(securityEvents.id))
      .limit(limit)
      .offset(offset);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves an individual security event by ID
   */
  static async getEventById(id: number): Promise<SecurityEvent | null> {
    const [event] = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.id, id))
      .limit(1);

    return event || null;
  }

  /**
   * Aggregates telemetry metrics for the V0 dashboard
   */
  static async getEventStats(): Promise<EventStats> {
    const allEvents = await db
      .select()
      .from(securityEvents)
      .orderBy(desc(securityEvents.timestamp))
      .limit(500);

    let high = 0;
    let medium = 0;
    let low = 0;
    let info = 0;
    const byProtocol: Record<string, number> = {};

    for (const ev of allEvents) {
      if (ev.priority === 1) high++;
      else if (ev.priority === 2) medium++;
      else if (ev.priority === 3) low++;
      else info++;

      const proto = ev.protocol || 'OTHER';
      byProtocol[proto] = (byProtocol[proto] || 0) + 1;
    }

    const [totalCountResult] = await db.select({ total: count() }).from(securityEvents);
    const total = Number(totalCountResult?.total || 0);

    const recentAlerts = allEvents.slice(0, 5);

    return {
      total,
      byPriority: { high, medium, low, info },
      byProtocol,
      recentAlerts,
    };
  }
}
