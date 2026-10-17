import { initializeDatabase, db } from '../../db/index.ts';
import { incidents, investigationEntries, users } from '../../db/schema.ts';
import { IncidentsService } from './incidents.service.ts';
import { InvestigationsService } from './investigations.service.ts';
import { eq, inArray } from 'drizzle-orm';

async function runInvestigationTests() {
  console.log('[Investigations Test] Initializing database...');
  await initializeDatabase();

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'lead_admin@netguard.local'))
    .limit(1);

  if (!admin) {
    throw new Error('Bootstrap admin user not found');
  }

  console.log('[Investigations Test] 1. Creating test incident for investigation timeline...');
  const { incident: testInc } = await IncidentsService.createIncident({
    title: 'INC-INV-TEST: Suspected Data Exfiltration',
    description: 'Anomalous outbound encrypted traffic bursts observed.',
    severity: 'SEV2',
    createdBy: admin.id,
  });
  console.log(`[Investigations Test] Created Incident #${testInc.id}`);

  console.log('[Investigations Test] 2. Adding investigation findings across different entry types...');
  const entry1 = await InvestigationsService.addEntry({
    incidentId: testInc.id,
    authorId: admin.id,
    entryType: 'NOTE',
    content: 'Observed 4.2GB transferred to unfamiliar external IP 198.51.100.99 over port 443.',
  });
  console.log(`[Investigations Test] Added Note ID ${entry1.id} (Author: ${entry1.author?.email})`);

  const entry2 = await InvestigationsService.addEntry({
    incidentId: testInc.id,
    authorId: admin.id,
    entryType: 'ACTION_TAKEN',
    content: 'Isolated affected internal endpoint 192.168.1.105 from corporate VLAN.',
  });
  console.log(`[Investigations Test] Added Action ID ${entry2.id}`);

  const entry3 = await InvestigationsService.addEntry({
    incidentId: testInc.id,
    authorId: admin.id,
    entryType: 'CONTAINMENT',
    content: 'Revoked active session tokens and forced credential reset for compromised service account.',
  });
  console.log(`[Investigations Test] Added Containment ID ${entry3.id}`);

  const entry4 = await InvestigationsService.addEntry({
    incidentId: testInc.id,
    authorId: admin.id,
    entryType: 'EVIDENCE',
    content: 'Memory dump and network packet capture archive saved to /var/log/forensics/pcaps-20261015.pcap.',
  });
  console.log(`[Investigations Test] Added Evidence ID ${entry4.id}`);

  console.log('[Investigations Test] 3. Testing chronological retrieval (ASC order)...');
  const ascTimeline = await InvestigationsService.getEntriesByIncident(testInc.id, 'asc');
  if (ascTimeline.length !== 4) {
    throw new Error(`Expected 4 timeline entries, got ${ascTimeline.length}`);
  }
  if (ascTimeline[0].id !== entry1.id || ascTimeline[3].id !== entry4.id) {
    throw new Error('Chronological ASC ordering failed: first or last entry out of order.');
  }
  console.log('[Investigations Test] Chronological ASC ordering verified.');

  console.log('[Investigations Test] 4. Testing reverse chronological retrieval (DESC order)...');
  const descTimeline = await InvestigationsService.getEntriesByIncident(testInc.id, 'desc');
  if (descTimeline[0].id !== entry4.id || descTimeline[3].id !== entry1.id) {
    throw new Error('Chronological DESC ordering failed: newest entry was not first.');
  }
  console.log('[Investigations Test] Chronological DESC ordering verified.');

  console.log('[Investigations Test] 5. Testing input validation on empty content...');
  let caughtEmptyError = false;
  try {
    await InvestigationsService.addEntry({
      incidentId: testInc.id,
      authorId: admin.id,
      entryType: 'NOTE',
      content: '   ',
    });
  } catch (err: any) {
    caughtEmptyError = true;
    console.log(`[Investigations Test] Caught empty content rejection: ${err.message}`);
  }
  if (!caughtEmptyError) {
    throw new Error('Expected empty content to be rejected with validation error.');
  }

  console.log('[Investigations Test] 6. Testing non-existent incident rejection...');
  let caughtMissingInc = false;
  try {
    await InvestigationsService.addEntry({
      incidentId: 9999999,
      authorId: admin.id,
      entryType: 'NOTE',
      content: 'Should fail for missing incident',
    });
  } catch (err: any) {
    caughtMissingInc = true;
    console.log(`[Investigations Test] Caught missing incident rejection: ${err.message}`);
  }
  if (!caughtMissingInc) {
    throw new Error('Expected non-existent incident to throw error.');
  }

  console.log('[Investigations Test] 7. Testing foreign key cascade deletion...');
  await db.delete(incidents).where(eq(incidents.id, testInc.id));
  const orphanedEntries = await db
    .select()
    .from(investigationEntries)
    .where(eq(investigationEntries.incidentId, testInc.id));
  if (orphanedEntries.length !== 0) {
    throw new Error(`Cascade deletion failed: found ${orphanedEntries.length} orphaned investigation entries.`);
  }
  console.log('[Investigations Test] Cascade deletion verified (entries deleted with parent incident).');

  console.log('[Investigations Test] ALL INVESTIGATION WORKFLOW TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runInvestigationTests().catch((err) => {
  console.error('[Investigations Test FAILED]:', err);
  process.exit(1);
});
