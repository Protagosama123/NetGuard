import { initializeDatabase, db } from '../../db/index.ts';
import { securityEvents, alerts } from '../../db/schema.ts';
import { EventsService } from '../events/events.service.ts';
import { AlertsService } from './alerts.service.ts';
import { inArray, eq } from 'drizzle-orm';

async function runAlertsTests() {
  console.log('[Alerts Test] Initializing database...');
  await initializeDatabase();

  const createdAlertIds: number[] = [];
  const createdEventIds: number[] = [];

  console.log('[Alerts Test] 1. Testing automatic alert creation from High Priority Snort Event...');
  const event1 = await EventsService.ingestEvent({
    signatureId: 2100498,
    signatureMessage: 'GPL ATTACK_RESPONSE id check returned root',
    classification: 'Privilege Escalation Attempt',
    priority: 1, // Priority 1 -> Should auto-generate Alert
    protocol: 'TCP',
    sourceIp: '198.51.100.99',
    destinationIp: '192.168.1.50',
    rawPayload: 'uid=0(root) gid=0(root)',
  });
  createdEventIds.push(event1.id);

  // Check if alert was auto-generated
  const [autoAlert] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.securityEventId, event1.id));

  if (!autoAlert) {
    throw new Error('Auto-promotion failed: Expected alert to be generated for Priority 1 event');
  }
  createdAlertIds.push(autoAlert.id);
  console.log(`[Alerts Test] Auto-created Alert ID ${autoAlert.id}: [${autoAlert.severity}] ${autoAlert.title} (Status: ${autoAlert.status})`);
  if (autoAlert.status !== 'NEW') {
    throw new Error(`Expected new alert status 'NEW', got '${autoAlert.status}'`);
  }
  if (autoAlert.severity !== 'CRITICAL') {
    throw new Error(`Expected 'CRITICAL' for root privilege escalation, got '${autoAlert.severity}'`);
  }

  console.log('[Alerts Test] 2. Testing manual promotion of low-priority event to alert...');
  const lowEvent = await EventsService.ingestEvent({
    signatureId: 2013028,
    signatureMessage: 'ET POLICY DNS Query to Suspicious Top Level Domain .top',
    classification: 'Corporate Policy Violation',
    priority: 3, // Low priority -> should not auto-generate
    protocol: 'UDP',
    sourceIp: '192.168.1.180',
    destinationIp: '1.1.1.1',
  });
  createdEventIds.push(lowEvent.id);

  const promotedAlert = await AlertsService.promoteEvent(
    lowEvent.id,
    'Investigate Potential C2 Domain Beaconing',
    'MEDIUM',
    'Analyst escalated after multiple DNS queries observed.'
  );
  createdAlertIds.push(promotedAlert.id);
  console.log(`[Alerts Test] Manually promoted Alert ID ${promotedAlert.id} (Severity: ${promotedAlert.severity})`);

  console.log('[Alerts Test] 3. Testing getAlertById() with source security event link...');
  const alertDetail = await AlertsService.getAlertById(autoAlert.id);
  if (!alertDetail || !alertDetail.sourceEvent) {
    throw new Error('Failed to retrieve alert with sourceEvent link');
  }
  if (alertDetail.sourceEvent.id !== event1.id) {
    throw new Error(`Source event ID mismatch: expected ${event1.id}, got ${alertDetail.sourceEvent.id}`);
  }
  console.log('[Alerts Test] Source event linkage verified successfully.');

  console.log('[Alerts Test] 4. Testing permitted status transitions (NEW -> IN_PROGRESS -> RESOLVED)...');
  const inProgressAlert = await AlertsService.updateAlertStatus(autoAlert.id, 'IN_PROGRESS');
  if (inProgressAlert.status !== 'IN_PROGRESS') {
    throw new Error(`Expected status 'IN_PROGRESS', got ${inProgressAlert.status}`);
  }

  const resolvedAlert = await AlertsService.updateAlertStatus(autoAlert.id, 'RESOLVED');
  if (resolvedAlert.status !== 'RESOLVED') {
    throw new Error(`Expected status 'RESOLVED', got ${resolvedAlert.status}`);
  }

  // Reopen
  const reopenedAlert = await AlertsService.updateAlertStatus(autoAlert.id, 'IN_PROGRESS');
  if (reopenedAlert.status !== 'IN_PROGRESS') {
    throw new Error(`Expected reopened status 'IN_PROGRESS', got ${reopenedAlert.status}`);
  }
  console.log('[Alerts Test] Permitted transitions verified successfully.');

  console.log('[Alerts Test] 5. Testing rejection of invalid status transitions...');
  let caughtInvalid = false;
  try {
    // Attempt invalid transition: NEW alert cannot jump directly to RESOLVED without triage
    await AlertsService.updateAlertStatus(promotedAlert.id, 'RESOLVED');
  } catch (err: any) {
    caughtInvalid = true;
    console.log(`[Alerts Test] Caught invalid transition as expected: ${err.message}`);
  }
  if (!caughtInvalid) {
    throw new Error('Failed: Expected invalid transition NEW -> RESOLVED to throw an error');
  }

  console.log('[Alerts Test] 6. Testing queryAlerts() with filters & search...');
  const queryResult = await AlertsService.queryAlerts({
    status: 'IN_PROGRESS',
  });
  if (!queryResult.alerts.some((a) => a.id === autoAlert.id)) {
    throw new Error('Filter by status failed to return active alert');
  }

  const searchResult = await AlertsService.queryAlerts({
    search: 'C2 Domain',
  });
  if (!searchResult.alerts.some((a) => a.id === promotedAlert.id)) {
    throw new Error('Search query failed to match promoted alert title');
  }
  console.log(`[Alerts Test] Filter & search verified. Total alerts matching: ${queryResult.alerts.length}`);

  console.log('[Alerts Test] 7. Testing getAlertStats()...');
  const stats = await AlertsService.getAlertStats();
  console.log('[Alerts Test] Alert metrics:', JSON.stringify(stats));
  if (stats.total < 2) {
    throw new Error(`Expected at least 2 alerts in stats, got ${stats.total}`);
  }

  // Cleanup test artifacts
  console.log('[Alerts Test] Cleaning up test records...');
  await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
  await db.delete(securityEvents).where(inArray(securityEvents.id, createdEventIds));
  console.log('[Alerts Test] Cleanup complete.');

  console.log('[Alerts Test] ALL ALERT MANAGEMENT TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runAlertsTests().catch((err) => {
  console.error('[Alerts Test FAILED]:', err);
  process.exit(1);
});
