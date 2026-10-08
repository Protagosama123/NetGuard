import { db, initializeDatabase } from './index.ts';
import { users, securityEvents } from './schema.ts';
import { eq } from 'drizzle-orm';

async function runTests() {
  console.log('[Test] Initializing NetGuard database schemas...');
  await initializeDatabase();
  console.log('[Test] Schemas initialized successfully.');

  // Test 1: User insertion & query with Drizzle ORM
  console.log('[Test] Testing user insert with Drizzle ORM...');
  const testEmail = `test_admin_${Date.now()}@netguard.local`;
  const [createdUser] = await db
    .insert(users)
    .values({
      email: testEmail,
      passwordHash: '$2a$12$eXampLeHashForNetguardTestingPurposesOnly',
      role: 'ADMIN',
      isActive: true,
    })
    .returning();

  console.log(`[Test] Inserted user ID ${createdUser.id} (${createdUser.email}, role: ${createdUser.role})`);

  const fetchedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, createdUser.id))
    .limit(1);

  if (!fetchedUser.length || fetchedUser[0].email !== testEmail) {
    throw new Error('User roundtrip test failed');
  }
  console.log('[Test] User roundtrip verified.');

  // Test 2: Snort Security Event insertion & query
  console.log('[Test] Testing Snort security event insert...');
  const [createdEvent] = await db
    .insert(securityEvents)
    .values({
      timestamp: new Date(),
      generatorId: 1,
      signatureId: 2001219,
      signatureRevision: 4,
      signatureMessage: 'ET SCAN Potential SSH Scan OUTBOUND',
      classification: 'Attempted Information Leak',
      priority: 2,
      protocol: 'TCP',
      sourceIp: '192.168.1.105',
      sourcePort: 43210,
      destinationIp: '10.0.0.1',
      destinationPort: 22,
      rawPayload: 'SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5',
    })
    .returning();

  console.log(`[Test] Inserted event ID ${createdEvent.id} (SID: ${createdEvent.signatureId}, Priority: ${createdEvent.priority})`);

  const fetchedEvent = await db
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.id, createdEvent.id))
    .limit(1);

  if (!fetchedEvent.length || fetchedEvent[0].signatureId !== 2001219) {
    throw new Error('Security event roundtrip test failed');
  }
  console.log('[Test] Security event roundtrip verified.');

  // Clean up test records
  await db.delete(users).where(eq(users.id, createdUser.id));
  await db.delete(securityEvents).where(eq(securityEvents.id, createdEvent.id));
  console.log('[Test] Test cleanup complete.');
  console.log('[Test] All Milestone 1 validation checks PASSED.');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[Test Failed]:', err);
  process.exit(1);
});
