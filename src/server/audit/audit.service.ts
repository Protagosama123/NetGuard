import { desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { auditLogs, type AuditLog, type NewAuditLog } from '../../db/schema.ts';

export interface LogActionInput {
  actorId?: number | null;
  actorEmail?: string | null;
  action: string;
  targetEntity: string;
  targetId?: number | null;
  details?: Record<string, unknown> | string | null;
}

export class AuditService {
  /**
   * Records an administrative or security-critical audit log entry
   */
  static async logAction(input: LogActionInput): Promise<AuditLog | null> {
    try {
      const detailsStr =
        input.details === null || input.details === undefined
          ? null
          : typeof input.details === 'string'
          ? input.details
          : JSON.stringify(input.details);

      const record: NewAuditLog = {
        actorId: input.actorId || null,
        actorEmail: input.actorEmail || null,
        action: input.action.trim(),
        targetEntity: input.targetEntity.trim(),
        targetId: input.targetId || null,
        details: detailsStr,
        createdAt: new Date(),
      };

      const [created] = await db.insert(auditLogs).values(record).returning();
      return created;
    } catch (err) {
      console.warn('[AuditService] Failed to record audit log:', err);
      return null;
    }
  }

  /**
   * Retrieves recent audit log trail
   */
  static async getAuditLogs(limit = 50, offset = 0): Promise<AuditLog[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(safeLimit)
      .offset(offset);
  }
}
