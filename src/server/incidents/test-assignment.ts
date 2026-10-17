import { initializeDatabase, db } from '../../db/index.ts';
import { incidents, users, type User } from '../../db/schema.ts';
import { IncidentsService } from './incidents.service.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function runAssignmentTests() {
  console.log('[Assignment Test] Initializing database...');
  await initializeDatabase();

  // Create test analyst
  const analystHash = await bcrypt.hash('Analyst123!', 10);
  const [analystUser] = await db
    .insert(users)
    .values({
      email: `test_analyst_${Date.now()}@netguard.local`,
      passwordHash: analystHash,
      role: 'ANALYST',
      isActive: true,
    })
    .returning();

  // Create test viewer
  const viewerHash = await bcrypt.hash('Viewer123!', 10);
  const [viewerUser] = await db
    .insert(users)
    .values({
      email: `test_viewer_${Date.now()}@netguard.local`,
      passwordHash: viewerHash,
      role: 'VIEWER',
      isActive: true,
    })
    .returning();

  // Create deactivated analyst
  const [deactivatedUser] = await db
    .insert(users)
    .values({
      email: `deactivated_analyst_${Date.now()}@netguard.local`,
      passwordHash: analystHash,
      role: 'ANALYST',
      isActive: false, // Deactivated!
    })
    .returning();

  console.log('[Assignment Test] 1. Creating test incident...');
  const { incident: testInc } = await IncidentsService.createIncident({
    title: 'INC-ASSIGN-TEST: Web Shell Infiltration Probe',
    description: 'Suspicious JSP web shell upload attempt.',
    severity: 'SEV2',
  });
  console.log(`[Assignment Test] Incident #${testInc.id} created (Assigned: ${testInc.assignedTo})`);

  console.log('[Assignment Test] 2. Assigning incident to active ANALYST...');
  const assigned = await IncidentsService.assignIncident(testInc.id, analystUser.id);
  if (assigned.assignedTo !== analystUser.id) {
    throw new Error(`Expected assignedTo ${analystUser.id}, got ${assigned.assignedTo}`);
  }
  console.log(`[Assignment Test] Incident successfully assigned to analyst: ${analystUser.email}`);

  console.log('[Assignment Test] 3. Unassigning incident (clearing assignment)...');
  const unassigned = await IncidentsService.assignIncident(testInc.id, null);
  if (unassigned.assignedTo !== null) {
    throw new Error(`Expected assignedTo null, got ${unassigned.assignedTo}`);
  }
  console.log('[Assignment Test] Assignment successfully cleared.');

  console.log('[Assignment Test] 4. Testing rejection when assigning to VIEWER role...');
  let caughtViewerError = false;
  try {
    await IncidentsService.assignIncident(testInc.id, viewerUser.id);
  } catch (err: any) {
    caughtViewerError = true;
    console.log(`[Assignment Test] Caught viewer rejection as expected: ${err.message}`);
  }
  if (!caughtViewerError) {
    throw new Error('Expected assigning to VIEWER to throw validation error.');
  }

  console.log('[Assignment Test] 5. Testing rejection when assigning to deactivated user...');
  let caughtDeactivatedError = false;
  try {
    await IncidentsService.assignIncident(testInc.id, deactivatedUser.id);
  } catch (err: any) {
    caughtDeactivatedError = true;
    console.log(`[Assignment Test] Caught deactivated user rejection: ${err.message}`);
  }
  if (!caughtDeactivatedError) {
    throw new Error('Expected assigning to deactivated user to throw validation error.');
  }

  console.log('[Assignment Test] 6. Testing rejection when assigning to non-existent user...');
  let caughtMissingError = false;
  try {
    await IncidentsService.assignIncident(testInc.id, 9999999);
  } catch (err: any) {
    caughtMissingError = true;
    console.log(`[Assignment Test] Caught missing user rejection: ${err.message}`);
  }
  if (!caughtMissingError) {
    throw new Error('Expected assigning to non-existent user to throw validation error.');
  }

  console.log('[Assignment Test] 7. Testing formal incident resolution with summary...');
  // Transition to INVESTIGATING first so transition to RESOLVED is valid
  await IncidentsService.updateStatus(testInc.id, 'INVESTIGATING');

  const resolved = await IncidentsService.resolveIncident(
    testInc.id,
    'Web shell upload payload was quarantined. Target directory permissions corrected.'
  );

  if (resolved.status !== 'RESOLVED' || !resolved.resolvedAt || !resolved.resolutionSummary) {
    throw new Error('Failed to resolve incident: status, resolvedAt or summary missing.');
  }
  console.log(`[Assignment Test] Incident resolved at ${resolved.resolvedAt.toISOString()}`);

  console.log('[Assignment Test] 8. Testing reopening clears resolvedAt timestamp...');
  const reopened = await IncidentsService.updateStatus(testInc.id, 'INVESTIGATING');
  if (reopened.status !== 'INVESTIGATING' || reopened.resolvedAt !== null) {
    throw new Error(`Expected reopened status 'INVESTIGATING' and resolvedAt null, got ${reopened.resolvedAt}`);
  }
  console.log('[Assignment Test] Reopening incident correctly cleared resolvedAt timestamp.');

  // Cleanup
  console.log('[Assignment Test] Cleaning up test records...');
  await db.delete(incidents).where(eq(incidents.id, testInc.id));
  await db.delete(users).where(eq(users.id, analystUser.id));
  await db.delete(users).where(eq(users.id, viewerUser.id));
  await db.delete(users).where(eq(users.id, deactivatedUser.id));
  console.log('[Assignment Test] Cleanup complete.');

  console.log('[Assignment Test] ALL ASSIGNMENT & RESOLUTION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runAssignmentTests().catch((err) => {
  console.error('[Assignment Test FAILED]:', err);
  process.exit(1);
});
