import { eq, and, desc, count, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  incidents,
  incidentAlerts,
  alerts,
  users,
  type Incident,
  type NewIncident,
  type IncidentSeverity,
  type IncidentStatus,
  type Alert,
} from '../../db/schema.ts';
import { RealtimeGateway } from '../realtime/gateway.ts';

export interface CreateIncidentInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  assignedTo?: number | null;
  createdBy?: number | null;
  alertIds?: number[];
}

export interface IncidentQueryFilter {
  page?: number;
  limit?: number;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  assignedTo?: number;
  search?: string;
}

export interface IncidentStats {
  total: number;
  active: number;
  unassigned: number;
  byStatus: {
    open: number;
    investigating: number;
    contained: number;
    resolved: number;
    closed: number;
  };
  bySeverity: {
    sev1: number;
    sev2: number;
    sev3: number;
    sev4: number;
  };
}

export class IncidentsService {
  /**
   * Enforces valid incident status lifecycle transitions
   */
  static isValidStatusTransition(currentStatus: IncidentStatus, newStatus: IncidentStatus): boolean {
    if (currentStatus === newStatus) return true;

    switch (currentStatus) {
      case 'OPEN':
        return newStatus === 'INVESTIGATING';
      case 'INVESTIGATING':
        return newStatus === 'CONTAINED' || newStatus === 'RESOLVED' || newStatus === 'OPEN';
      case 'CONTAINED':
        return newStatus === 'RESOLVED' || newStatus === 'INVESTIGATING';
      case 'RESOLVED':
        return newStatus === 'CLOSED' || newStatus === 'INVESTIGATING';
      case 'CLOSED':
        return newStatus === 'INVESTIGATING'; // Reopening
      default:
        return false;
    }
  }

  /**
   * Creates an Incident with optional initial linked alerts (atomic transaction)
   */
  static async createIncident(input: CreateIncidentInput): Promise<{
    incident: Incident;
    linkedAlerts: Alert[];
  }> {
    // Validate assigned user if provided
    if (input.assignedTo) {
      const [assignee] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.assignedTo))
        .limit(1);

      if (!assignee) {
        throw new Error(`Assignee user #${input.assignedTo} does not exist.`);
      }
      if (!assignee.isActive) {
        throw new Error(`Assignee user #${input.assignedTo} is deactivated.`);
      }
      if (assignee.role === 'VIEWER') {
        throw new Error(`Assignee user #${input.assignedTo} has VIEWER role. Incidents can only be assigned to ADMIN or ANALYST.`);
      }
    }

    const newRecord: NewIncident = {
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      status: 'OPEN',
      assignedTo: input.assignedTo || null,
      createdBy: input.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [createdIncident] = await db.insert(incidents).values(newRecord).returning();

    const linkedAlerts: Alert[] = [];

    // Link alerts if provided
    if (input.alertIds && input.alertIds.length > 0) {
      const validAlerts = await db
        .select()
        .from(alerts)
        .where(inArray(alerts.id, input.alertIds));

      for (const al of validAlerts) {
        await db
          .insert(incidentAlerts)
          .values({
            incidentId: createdIncident.id,
            alertId: al.id,
            addedBy: input.createdBy || null,
            addedAt: new Date(),
          })
          .onConflictDoNothing();

        // If alert was NEW, transition it to IN_PROGRESS
        if (al.status === 'NEW') {
          await db
            .update(alerts)
            .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
            .where(eq(alerts.id, al.id));
          al.status = 'IN_PROGRESS';
        }

        linkedAlerts.push(al);
      }
    }

    try {
      RealtimeGateway.getInstance().broadcast('incident:created', createdIncident);
    } catch {}

    return {
      incident: createdIncident,
      linkedAlerts,
    };
  }

  /**
   * Queries incidents with filtering and pagination
   */
  static async queryIncidents(filter: IncidentQueryFilter) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filter.status) {
      conditions.push(eq(incidents.status, filter.status));
    }

    if (filter.severity) {
      conditions.push(eq(incidents.severity, filter.severity));
    }

    if (filter.assignedTo !== undefined) {
      conditions.push(eq(incidents.assignedTo, filter.assignedTo));
    }

    if (filter.search) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(incidents.title, term),
          ilike(incidents.description, term),
          ilike(incidents.resolutionSummary, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    const [countResult] = await db
      .select({ total: count() })
      .from(incidents)
      .where(whereClause);

    const total = Number(countResult?.total || 0);

    // Records
    const rawIncidents = await db
      .select()
      .from(incidents)
      .where(whereClause)
      .orderBy(desc(incidents.createdAt), desc(incidents.id))
      .limit(limit)
      .offset(offset);

    // Attach assignee and alert counts
    const enriched = await Promise.all(
      rawIncidents.map(async (inc) => {
        let assignee = null;
        if (inc.assignedTo) {
          const [u] = await db
            .select({ id: users.id, email: users.email, role: users.role })
            .from(users)
            .where(eq(users.id, inc.assignedTo))
            .limit(1);
          assignee = u || null;
        }

        const [alertsCountRes] = await db
          .select({ total: count() })
          .from(incidentAlerts)
          .where(eq(incidentAlerts.incidentId, inc.id));

        return {
          ...inc,
          assignee,
          alertCount: Number(alertsCountRes?.total || 0),
        };
      })
    );

    return {
      incidents: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single incident details including linked alerts and operator profiles
   */
  static async getIncidentById(id: number) {
    const [incidentRecord] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);

    if (!incidentRecord) {
      return null;
    }

    let assignee = null;
    if (incidentRecord.assignedTo) {
      const [u] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, incidentRecord.assignedTo))
        .limit(1);
      assignee = u || null;
    }

    let creator = null;
    if (incidentRecord.createdBy) {
      const [c] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, incidentRecord.createdBy))
        .limit(1);
      creator = c || null;
    }

    // Fetch linked alerts
    const links = await db
      .select({
        alertId: incidentAlerts.alertId,
        addedAt: incidentAlerts.addedAt,
      })
      .from(incidentAlerts)
      .where(eq(incidentAlerts.incidentId, id));

    let linkedAlerts: Alert[] = [];
    if (links.length > 0) {
      linkedAlerts = await db
        .select()
        .from(alerts)
        .where(inArray(alerts.id, links.map((l) => l.alertId)));
    }

    return {
      ...incidentRecord,
      assignee,
      creator,
      alerts: linkedAlerts,
    };
  }

  /**
   * Links alerts to an incident
   */
  static async linkAlerts(incidentId: number, alertIds: number[], operatorId?: number) {
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!incident) {
      throw new Error(`Incident #${incidentId} not found.`);
    }

    const validAlerts = await db
      .select()
      .from(alerts)
      .where(inArray(alerts.id, alertIds));

    for (const al of validAlerts) {
      await db
        .insert(incidentAlerts)
        .values({
          incidentId,
          alertId: al.id,
          addedBy: operatorId || null,
          addedAt: new Date(),
        })
        .onConflictDoNothing();

      if (al.status === 'NEW') {
        await db
          .update(alerts)
          .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
          .where(eq(alerts.id, al.id));
      }
    }

    return this.getIncidentById(incidentId);
  }

  /**
   * Unlinks an alert from an incident
   */
  static async unlinkAlert(incidentId: number, alertId: number) {
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!incident) {
      throw new Error(`Incident #${incidentId} not found.`);
    }

    await db
      .delete(incidentAlerts)
      .where(
        and(
          eq(incidentAlerts.incidentId, incidentId),
          eq(incidentAlerts.alertId, alertId)
        )
      );

    return true;
  }

  /**
   * Transitions incident status with state validation and mandatory resolution summary
   */
  static async updateStatus(
    id: number,
    newStatus: IncidentStatus,
    resolutionSummary?: string
  ): Promise<Incident> {
    const [current] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Incident #${id} not found.`);
    }

    if (!this.isValidStatusTransition(current.status, newStatus)) {
      throw new Error(
        `Invalid incident status transition from '${current.status}' to '${newStatus}'. Permitted transitions: ` +
          (current.status === 'OPEN'
            ? 'INVESTIGATING'
            : current.status === 'INVESTIGATING'
            ? 'CONTAINED, RESOLVED, OPEN'
            : current.status === 'CONTAINED'
            ? 'RESOLVED, INVESTIGATING'
            : current.status === 'RESOLVED'
            ? 'CLOSED, INVESTIGATING (reopen)'
            : 'INVESTIGATING (reopen)')
      );
    }

    // Require resolution summary when resolving or closing
    if ((newStatus === 'RESOLVED' || newStatus === 'CLOSED') && !resolutionSummary?.trim() && !current.resolutionSummary) {
      throw new Error('A non-empty resolution summary is required to resolve or close an incident.');
    }

    const isResolving = (newStatus === 'RESOLVED' || newStatus === 'CLOSED') && !current.resolvedAt;
    const isReopening = (current.status === 'RESOLVED' || current.status === 'CLOSED') && newStatus === 'INVESTIGATING';

    const [updated] = await db
      .update(incidents)
      .set({
        status: newStatus,
        resolvedAt: isResolving ? new Date() : isReopening ? null : current.resolvedAt,
        resolutionSummary: resolutionSummary?.trim() || current.resolutionSummary,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, id))
      .returning();

    try {
      RealtimeGateway.getInstance().broadcast('incident:status_changed', {
        id: updated.id,
        status: updated.status,
        resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch {}

    return updated;
  }

  /**
   * Assigns or clears an incident assignment
   */
  static async assignIncident(incidentId: number, assigneeId: number | null): Promise<Incident> {
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!incident) {
      throw new Error(`Incident #${incidentId} not found.`);
    }

    if (assigneeId !== null && assigneeId !== undefined) {
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, assigneeId))
        .limit(1);

      if (!targetUser) {
        throw new Error(`User #${assigneeId} not found.`);
      }
      if (!targetUser.isActive) {
        throw new Error(`Cannot assign incident to deactivated user ${targetUser.email}.`);
      }
      if (targetUser.role === 'VIEWER') {
        throw new Error(`Cannot assign incident to user with VIEWER role. Assignee must be ADMIN or ANALYST.`);
      }
    }

    const [updated] = await db
      .update(incidents)
      .set({
        assignedTo: assigneeId,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, incidentId))
      .returning();

    try {
      RealtimeGateway.getInstance().broadcast('incident:assigned', {
        id: updated.id,
        assignedTo: updated.assignedTo,
      });
    } catch {}

    return updated;
  }

  /**
   * Formally resolves or closes an incident with resolution summary
   */
  static async resolveIncident(
    incidentId: number,
    resolutionSummary: string,
    targetStatus: 'RESOLVED' | 'CLOSED' = 'RESOLVED'
  ): Promise<Incident> {
    if (!resolutionSummary || resolutionSummary.trim().length < 5) {
      throw new Error('A detailed resolution summary (at least 5 characters) is required to resolve an incident.');
    }

    return this.updateStatus(incidentId, targetStatus, resolutionSummary.trim());
  }

  /**
   * Aggregates high-level incident metrics
   */
  static async getIncidentStats(): Promise<IncidentStats> {
    const all = await db.select().from(incidents);

    let active = 0;
    let unassigned = 0;

    const byStatus = {
      open: 0,
      investigating: 0,
      contained: 0,
      resolved: 0,
      closed: 0,
    };

    const bySeverity = {
      sev1: 0,
      sev2: 0,
      sev3: 0,
      sev4: 0,
    };

    for (const inc of all) {
      if (inc.status !== 'CLOSED') {
        active++;
        if (!inc.assignedTo) {
          unassigned++;
        }
      }

      if (inc.status === 'OPEN') byStatus.open++;
      else if (inc.status === 'INVESTIGATING') byStatus.investigating++;
      else if (inc.status === 'CONTAINED') byStatus.contained++;
      else if (inc.status === 'RESOLVED') byStatus.resolved++;
      else if (inc.status === 'CLOSED') byStatus.closed++;

      if (inc.severity === 'SEV1') bySeverity.sev1++;
      else if (inc.severity === 'SEV2') bySeverity.sev2++;
      else if (inc.severity === 'SEV3') bySeverity.sev3++;
      else if (inc.severity === 'SEV4') bySeverity.sev4++;
    }

    return {
      total: all.length,
      active,
      unassigned,
      byStatus,
      bySeverity,
    };
  }
}
