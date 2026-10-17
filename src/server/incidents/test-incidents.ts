import { initializeDatabase, db } from '../../db/index.ts';
import { incidents, alerts, incidentAlerts, users } from '../../db/schema.ts';
import { IncidentsService } from './incidents.service.ts';
import { inArray, eq } from 'drizzle-orm';

async function runIncidentsTests() {
  console.log('[Incidents Test] Initializing database...');
  await initializeDatabase();

  const createdIncidentIds: number[] = [];
  const createdAlertIds: number[] = [];

  // Create two test alerts
  const [testAlert1] = await db
    .insert(alerts)
    .values({
      title: 'Test Brute Force Alert',
      severity: 'HIGH',
      status: 'NEW',
      sourceIp: '192.0.2.10',
      destinationIp: '198.51.100.1',
      signatureId: 2001111,
    })
    .returning();
  createdAlertIds.push(testAlert1.id);

  const [testAlert2] = await db
    .insert(alerts)
    .values({
      title: 'Test Web Attack Alert',
      severity: 'CRITICAL',
      status: 'NEW',
      sourceIp: '192.0.2.20',
      destinationIp: '198.51.100.1',
      signatureId: 2002222,
    })
    .returning();
  createdAlertIds.push(testAlert2.id);

  const [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'lead_admin@netguard.local'))
    .limit(1);

  console.log('[Incidents Test] 1. Testing incident creation with initial alert association...');
  const createResult = await IncidentsService.createIncident({
    title: 'INC-TEST: Multi-Vector Breach Attempt',
    description: 'Suspicious combined brute force and web attack telemetry detected.',
    severity: 'SEV1',
    assignedTo: adminUser?.id || null,
    createdBy: adminUser?.id || null,
    alertIds: [testAlert1.id],
  });

  const createdInc = createResult.incident;
  createdIncidentIds.push(createdInc.id);
  console.log(`[Incidents Test] Created Incident ID ${createdInc.id} (Status: ${createdInc.status}, Severity: ${createdInc.severity})`);

  if (createdInc.status !== 'OPEN') {
    throw new Error(`Expected initial status 'OPEN', got ${createdInc.status}`);
  }

  // Verify testAlert1 transitioned to IN_PROGRESS
  const [refreshedAlert1] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, testAlert1.id));

  if (refreshedAlert1.status !== 'IN_PROGRESS') {
    throw new Error(`Expected linked alert to transition to 'IN_PROGRESS', got ${refreshedAlert1.status}`);
  }
  console.log('[Incidents Test] Linked alert status automatically updated to IN_PROGRESS.');

  console.log('[Incidents Test] 2. Testing linking additional alert to incident...');
  const updatedIncidentDetail = await IncidentsService.linkAlerts(createdInc.id, [testAlert2.id], adminUser?.id);
  if (!updatedIncidentDetail || updatedIncidentDetail.alerts.length !== 2) {
    throw new Error(`Expected 2 linked alerts, found ${updatedIncidentDetail?.alerts.length}`);
  }
  console.log('[Incidents Test] Second alert linked successfully.');

  console.log('[Incidents Test] 3. Testing unlinking alert from incident...');
  await IncidentsService.unlinkAlert(createdInc.id, testAlert2.id);
  const afterUnlink = await IncidentsService.getIncidentById(createdInc.id);
  if (afterUnlink?.alerts.length !== 1) {
    throw new Error(`Expected 1 alert after unlink, found ${afterUnlink?.alerts.length}`);
  }
  console.log('[Incidents Test] Alert unlinked successfully.');

  console.log('[Incidents Test] 4. Testing permitted status transitions (OPEN -> INVESTIGATING -> CONTAINED -> RESOLVED -> CLOSED)...');
  const investigatingInc = await IncidentsService.updateStatus(createdInc.id, 'INVESTIGATING');
  if (investigatingInc.status !== 'INVESTIGATING') {
    throw new Error(`Expected status 'INVESTIGATING', got ${investigatingInc.status}`);
  }

  const containedInc = await IncidentsService.updateStatus(createdInc.id, 'CONTAINED');
  if (containedInc.status !== 'CONTAINED') {
    throw new Error(`Expected status 'CONTAINED', got ${containedInc.status}`);
  }

  const resolvedInc = await IncidentsService.updateStatus(
    createdInc.id,
    'RESOLVED',
    'Attacking IP 192.0.2.10 blocked at perimeter firewall. Passwords reset.'
  );
  if (resolvedInc.status !== 'RESOLVED' || !resolvedInc.resolvedAt || !resolvedInc.resolutionSummary) {
    throw new Error(`Expected RESOLVED status with resolvedAt and resolutionSummary.`);
  }

  const closedInc = await IncidentsService.updateStatus(createdInc.id, 'CLOSED');
  if (closedInc.status !== 'CLOSED') {
    throw new Error(`Expected status 'CLOSED', got ${closedInc.status}`);
  }
  console.log('[Incidents Test] Permitted lifecycle transitions verified.');

  console.log('[Incidents Test] 5. Testing rejection of invalid status transitions...');
  let caughtReopenError = false;
  try {
    // Attempt invalid jump: CLOSED cannot jump directly to CONTAINED without reopening to INVESTIGATING
    await IncidentsService.updateStatus(createdInc.id, 'CONTAINED');
  } catch (err: any) {
    caughtReopenError = true;
    console.log(`[Incidents Test] Caught invalid transition error as expected: ${err.message}`);
  }
  if (!caughtReopenError) {
    throw new Error('Expected invalid transition from CLOSED to CONTAINED to throw error.');
  }

  console.log('[Incidents Test] 6. Testing queryIncidents() and pagination...');
  const queryResult = await IncidentsService.queryIncidents({
    status: 'CLOSED',
  });
  if (!queryResult.incidents.some((i) => i.id === createdInc.id)) {
    throw new Error('Query by status CLOSED failed to find created incident');
  }
  console.log(`[Incidents Test] Query verified. Total incidents matching: ${queryResult.incidents.length}`);

  console.log('[Incidents Test] 7. Testing getIncidentStats()...');
  const stats = await IncidentsService.getIncidentStats();
  console.log('[Incidents Test] Incident stats breakdown:', JSON.stringify(stats));
  if (stats.total < 1) {
    throw new Error('Expected at least 1 incident in stats');
  }

  // Cleanup
  console.log('[Incidents Test] Cleaning up test records...');
  await db.delete(incidentAlerts).where(eq(incidentAlerts.incidentId, createdInc.id));
  await db.delete(incidents).where(inArray(incidents.id, createdIncidentIds));
  await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
  console.log('[Incidents Test] Cleanup complete.');

  console.log('[Incidents Test] ALL INCIDENT MANAGEMENT TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runIncidentsTests().catch((err) => {
  console.error('[Incidents Test FAILED]:', err);
  process.exit(1);
});
