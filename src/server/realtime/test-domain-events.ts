import http from 'node:http';
import { WebSocket } from 'ws';
import { initializeDatabase, db } from '../../db/index.ts';
import { users, securityEvents, alerts, incidents, investigationEntries } from '../../db/schema.ts';
import { AuthService } from '../auth/auth.service.ts';
import { RealtimeGateway } from './gateway.ts';
import { EventsService } from '../events/events.service.ts';
import { AlertsService } from '../alerts/alerts.service.ts';
import { IncidentsService } from '../incidents/incidents.service.ts';
import { InvestigationsService } from '../incidents/investigations.service.ts';
import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function runDomainEventTests() {
  console.log('===============================================================');
  console.log('       NETGUARD V2.2 DOMAIN EVENT PUBLICATION TEST SUITE       ');
  console.log('===============================================================');

  console.log('\n[Phase 1] Database & Test Server Bootstrap...');
  await initializeDatabase();

  const pwdHash = await bcrypt.hash('DomainTest123!', 10);
  const [testAdmin] = await db
    .insert(users)
    .values({
      email: `domain_admin_${Date.now()}@netguard.local`,
      passwordHash: pwdHash,
      role: 'ADMIN',
      isActive: true,
    })
    .returning();

  const [testAnalyst] = await db
    .insert(users)
    .values({
      email: `domain_analyst_${Date.now()}@netguard.local`,
      passwordHash: pwdHash,
      role: 'ANALYST',
      isActive: true,
    })
    .returning();

  const adminToken = AuthService.signToken({
    id: testAdmin.id,
    email: testAdmin.email,
    role: testAdmin.role,
  });

  const testServer = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });

  const gateway = RealtimeGateway.getInstance();
  gateway.attach(testServer);

  const testPort = 3105;
  await new Promise<void>((resolve) => {
    testServer.listen(testPort, '127.0.0.1', () => {
      console.log(`✓ Test WebSocket server listening on port ${testPort}`);
      resolve();
    });
  });

  const clientWs = new WebSocket(`ws://127.0.0.1:${testPort}/ws?token=${adminToken}`);
  const eventQueue: Array<{ event: string; data: any }> = [];

  clientWs.on('message', (raw) => {
    const parsed = JSON.parse(raw.toString());
    eventQueue.push(parsed);
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 4000);
    clientWs.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  const waitForEvent = async (expectedEvent: string, timeoutMs = 4000): Promise<any> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = eventQueue.findIndex((e) => e.event === expectedEvent);
      if (idx !== -1) {
        return eventQueue.splice(idx, 1)[0];
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for event "${expectedEvent}". Current queue: ${eventQueue.map((e) => e.event).join(', ')}`);
  };

  const createdEventIds: number[] = [];
  const createdAlertIds: number[] = [];
  const createdIncidentIds: number[] = [];

  try {
    // Phase 2: Ingest Snort event -> telemetry:event_ingested
    console.log('\n[Phase 2] Testing EventsService.ingestEvent -> telemetry:event_ingested...');
    const event = await EventsService.ingestEvent({
      signatureId: 2199201,
      signatureMessage: 'ET TEST Realtime Snort Event',
      priority: 3, // Low priority to avoid auto-promotion here
      protocol: 'TCP',
      sourceIp: '198.51.100.99',
      destinationIp: '192.168.1.10',
    });
    createdEventIds.push(event.id);

    const telemetryMsg = await waitForEvent('telemetry:event_ingested');
    console.log(`✓ Received "telemetry:event_ingested" for SID ${telemetryMsg.data.signatureId}`);

    // Phase 3: Promote event to alert -> alert:created
    console.log('\n[Phase 3] Testing AlertsService.promoteEvent -> alert:created...');
    const alert = await AlertsService.promoteEvent(event.id, 'Test Realtime Promoted Alert', 'HIGH');
    createdAlertIds.push(alert.id);

    const alertCreatedMsg = await waitForEvent('alert:created');
    console.log(`✓ Received "alert:created" for Alert #${alertCreatedMsg.data.id} (${alertCreatedMsg.data.title})`);

    // Phase 4: Update alert status -> alert:status_changed
    console.log('\n[Phase 4] Testing AlertsService.updateAlertStatus -> alert:status_changed...');
    const updatedAlert = await AlertsService.updateAlertStatus(alert.id, 'IN_PROGRESS');
    const alertStatusMsg = await waitForEvent('alert:status_changed');
    console.log(`✓ Received "alert:status_changed": #${alertStatusMsg.data.id} is now ${alertStatusMsg.data.status}`);

    // Phase 5: Create incident -> incident:created
    console.log('\n[Phase 5] Testing IncidentsService.createIncident -> incident:created...');
    const { incident } = await IncidentsService.createIncident({
      title: 'Realtime Test Incident',
      description: 'Testing live event publication',
      severity: 'SEV2',
      alertIds: [alert.id],
      createdBy: testAdmin.id,
    });
    createdIncidentIds.push(incident.id);

    const incidentCreatedMsg = await waitForEvent('incident:created');
    console.log(`✓ Received "incident:created" for Incident #${incidentCreatedMsg.data.id}`);

    // Phase 6: Assign incident -> incident:assigned
    console.log('\n[Phase 6] Testing IncidentsService.assignIncident -> incident:assigned...');
    await IncidentsService.assignIncident(incident.id, testAnalyst.id);
    const incidentAssignedMsg = await waitForEvent('incident:assigned');
    console.log(`✓ Received "incident:assigned": #${incidentAssignedMsg.data.id} assigned to User #${incidentAssignedMsg.data.assignedTo}`);

    // Phase 7: Add investigation entry -> investigation:entry_added
    console.log('\n[Phase 7] Testing InvestigationsService.addEntry -> investigation:entry_added...');
    await InvestigationsService.addEntry({
      incidentId: incident.id,
      authorId: testAnalyst.id,
      entryType: 'CONTAINMENT',
      content: 'Host isolated from egress VLAN.',
    });
    const invMsg = await waitForEvent('investigation:entry_added');
    console.log(`✓ Received "investigation:entry_added" for Incident #${invMsg.data.incidentId}`);

    // Phase 8: Update incident status -> incident:status_changed
    console.log('\n[Phase 8] Testing IncidentsService.updateStatus -> incident:status_changed...');
    await IncidentsService.updateStatus(incident.id, 'INVESTIGATING');
    const incStatusMsg = await waitForEvent('incident:status_changed');
    console.log(`✓ Received "incident:status_changed": #${incStatusMsg.data.id} is now ${incStatusMsg.data.status}`);

    // Phase 9: Testing failure path does NOT emit events
    console.log('\n[Phase 9] Testing Failure Path (Invalid Status Transition Emits Zero Events)...');
    let threwError = false;
    try {
      // Invalid transition: INVESTIGATING -> CLOSED directly without resolution
      await IncidentsService.updateStatus(incident.id, 'CLOSED');
    } catch {
      threwError = true;
    }
    if (!threwError) throw new Error('Expected invalid transition to throw error.');

    // Wait 500ms to verify no stray event arrived
    await new Promise((r) => setTimeout(r, 500));
    const strayEvent = eventQueue.find((e) => e.event === 'incident:status_changed' && e.data.status === 'CLOSED');
    if (strayEvent) {
      throw new Error('Failure path emitted unexpected event over WebSocket!');
    }
    console.log('✓ Verified rejected operation emitted zero events (Post-Commit Guarantee satisfied).');

    // Phase 10: Teardown
    console.log('\n[Phase 10] Database Cleanup & Connection Teardown...');
    clientWs.close();
    testServer.close();

    if (createdIncidentIds.length) await db.delete(incidents).where(inArray(incidents.id, createdIncidentIds));
    if (createdAlertIds.length) await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
    if (createdEventIds.length) await db.delete(securityEvents).where(inArray(securityEvents.id, createdEventIds));
    await db.delete(users).where(inArray(users.id, [testAdmin.id, testAnalyst.id]));
    console.log('✓ Test data cleaned up.');

    console.log('\n===============================================================');
    console.log('   ★ ALL 10 DOMAIN EVENT PUBLICATION TESTS PASSED 100% ★       ');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ [DOMAIN EVENT TEST FAILED]:', err);
    try {
      clientWs.close();
      testServer.close();
      if (createdIncidentIds.length) await db.delete(incidents).where(inArray(incidents.id, createdIncidentIds));
      if (createdAlertIds.length) await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
      if (createdEventIds.length) await db.delete(securityEvents).where(inArray(securityEvents.id, createdEventIds));
      await db.delete(users).where(inArray(users.id, [testAdmin.id, testAnalyst.id]));
    } catch {}
    process.exit(1);
  }
}

runDomainEventTests();
