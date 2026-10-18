import { eq, desc, asc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  investigationEntries,
  incidents,
  users,
  type InvestigationEntry,
  type NewInvestigationEntry,
  type InvestigationEntryType,
} from '../../db/schema.ts';
import { RealtimeGateway } from '../realtime/gateway.ts';

export interface AddInvestigationEntryInput {
  incidentId: number;
  authorId?: number | null;
  entryType: InvestigationEntryType;
  content: string;
}

export class InvestigationsService {
  /**
   * Adds an investigation finding/note to an incident timeline
   */
  static async addEntry(input: AddInvestigationEntryInput) {
    if (!input.content || input.content.trim().length === 0) {
      throw new Error('Investigation entry content cannot be empty.');
    }

    // Verify incident exists
    const [incident] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, input.incidentId))
      .limit(1);

    if (!incident) {
      throw new Error(`Incident #${input.incidentId} not found.`);
    }

    const newRecord: NewInvestigationEntry = {
      incidentId: input.incidentId,
      authorId: input.authorId || null,
      entryType: input.entryType || 'NOTE',
      content: input.content.trim(),
      createdAt: new Date(),
    };

    const [created] = await db.insert(investigationEntries).values(newRecord).returning();

    // Update incident timestamp
    await db
      .update(incidents)
      .set({ updatedAt: new Date() })
      .where(eq(incidents.id, input.incidentId));

    // Enrich with author info
    let author = null;
    if (created.authorId) {
      const [u] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, created.authorId))
        .limit(1);
      author = u || null;
    }

    const enriched = {
      ...created,
      author,
    };

    try {
      RealtimeGateway.getInstance().broadcast('investigation:entry_added', {
        incidentId: input.incidentId,
        entry: enriched,
      });
    } catch {}

    return enriched;
  }

  /**
   * Retrieves chronological investigation entries for an incident
   */
  static async getEntriesByIncident(incidentId: number, order: 'asc' | 'desc' = 'asc') {
    // Verify incident exists
    const [incident] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!incident) {
      throw new Error(`Incident #${incidentId} not found.`);
    }

    const orderFn = order === 'desc' ? desc(investigationEntries.createdAt) : asc(investigationEntries.createdAt);

    const rawEntries = await db
      .select()
      .from(investigationEntries)
      .where(eq(investigationEntries.incidentId, incidentId))
      .orderBy(orderFn, asc(investigationEntries.id));

    // Attach author profiles
    const enriched = await Promise.all(
      rawEntries.map(async (entry) => {
        let author = null;
        if (entry.authorId) {
          const [u] = await db
            .select({ id: users.id, email: users.email, role: users.role })
            .from(users)
            .where(eq(users.id, entry.authorId))
            .limit(1);
          author = u || null;
        }
        return {
          ...entry,
          author,
        };
      })
    );

    return enriched;
  }
}
