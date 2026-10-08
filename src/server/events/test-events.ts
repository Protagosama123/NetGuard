import { initializeDatabase, db } from '../../db/index.ts';
import { securityEvents } from '../../db/schema.ts';
import { EventsService } from './events.service.ts';
import { inArray } from 'drizzle-orm';

async function runEventsTests() {
  console.log('[Events Test] Initializing database...');
  await initializeDatabase();

  const createdIds: number[] = [];

  console.log('[Events Test] 1. Ingesting single Snort telemetry event...');
  const event1 = await EventsService.ingestEvent({
    signatureId: 2100498,
    generatorId: 1,
    signatureRevision: 7,
    signatureMessage: 'GPL ATTACK_RESPONSE id check returned root',
    classification: 'Privilege Escalation Attempt',
    priority: 1, // High
    protocol: 'tcp',
    sourceIp: '198.51.100.44',
    sourcePort: 80,
    destinationIp: '192.168.1.50',
    destinationPort: 49152,
    rawPayload: 'uid=0(root) gid=0(root) groups=0(root)',
  });

  createdIds.push(event1.id);
  console.log(`[Events Test] Ingested event ID ${event1.id} (SID: ${event1.signatureId}, Priority: ${event1.priority}, Protocol: ${event1.protocol})`);
  if (event1.protocol !== 'TCP') {
    throw new Error(`Expected uppercase protocol TCP, got ${event1.protocol}`);
  }

  console.log('[Events Test] 2. Ingesting batch of Snort events...');
  const batch = await EventsService.ingestBatch([
    {
      signatureId: 2002911,
      generatorId: 1,
      signatureRevision: 3,
      signatureMessage: 'ET SCAN Suspicious Inbound to MSSQL port 1433',
      classification: 'Potentially Bad Traffic',
      priority: 2, // Medium
      protocol: 'TCP',
      sourceIp: '203.0.113.12',
      sourcePort: 51234,
      destinationIp: '192.168.1.20',
      destinationPort: 1433,
    },
    {
      signatureId: 2013028,
      generatorId: 1,
      signatureRevision: 6,
      signatureMessage: 'ET POLICY DNS Query to Suspicious Top Level Domain .top',
      classification: 'Corporate Policy Violation',
      priority: 3, // Low
      protocol: 'UDP',
      sourceIp: '192.168.1.100',
      sourcePort: 58212,
      destinationIp: '1.1.1.1',
      destinationPort: 53,
    },
    {
      signatureId: 2100499,
      generatorId: 1,
      signatureRevision: 1,
      signatureMessage: 'ICMP PING Sweeper Probe',
      classification: 'Information Gathering',
      priority: 4, // Info
      protocol: 'ICMP',
      sourceIp: '198.51.100.44',
      destinationIp: '192.168.1.1',
    },
  ]);

  for (const b of batch) {
    createdIds.push(b.id);
  }
  console.log(`[Events Test] Batch ingested ${batch.length} events successfully.`);

  console.log('[Events Test] 3. Testing queryEvents() with filters...');
  // Filter by priority = 1 (High)
  const highPriorityResult = await EventsService.queryEvents({ priority: 1 });
  if (!highPriorityResult.events.some((e) => e.id === event1.id)) {
    throw new Error('Priority filter failed to find High priority event');
  }
  console.log(`[Events Test] Query priority=1 returned ${highPriorityResult.events.length} events.`);

  // Filter by source IP
  const ipResult = await EventsService.queryEvents({ sourceIp: '198.51.100.44' });
  if (ipResult.events.length < 2) {
    throw new Error('IP filter failed to return expected events for 198.51.100.44');
  }
  console.log(`[Events Test] Query sourceIp=198.51.100.44 returned ${ipResult.events.length} events.`);

  // Filter by search text
  const searchResult = await EventsService.queryEvents({ search: 'MSSQL' });
  if (!searchResult.events.some((e) => e.signatureId === 2002911)) {
    throw new Error('Search query failed to match signatureMessage');
  }
  console.log('[Events Test] Search text query verified.');

  console.log('[Events Test] 4. Testing getEventById()...');
  const singleEvent = await EventsService.getEventById(event1.id);
  if (!singleEvent || singleEvent.signatureId !== 2100498) {
    throw new Error('getEventById returned incorrect event');
  }
  console.log('[Events Test] getEventById verified.');

  console.log('[Events Test] 5. Testing getEventStats()...');
  const stats = await EventsService.getEventStats();
  if (stats.total < 4) {
    throw new Error(`Expected at least 4 total events, got ${stats.total}`);
  }
  if (stats.byPriority.high < 1 || stats.byPriority.medium < 1 || stats.byPriority.low < 1) {
    throw new Error('Stats byPriority breakdown incomplete');
  }
  console.log('[Events Test] Telemetry stats aggregation verified:', JSON.stringify(stats.byPriority));

  // Cleanup
  console.log('[Events Test] Cleaning up test events...');
  await db.delete(securityEvents).where(inArray(securityEvents.id, createdIds));
  console.log('[Events Test] Test events cleanup complete.');

  console.log('[Events Test] ALL SNORT TELEMETRY EVENT TESTS PASSED!');
  process.exit(0);
}

runEventsTests().catch((err) => {
  console.error('[Events Test Failed]:', err);
  process.exit(1);
});
