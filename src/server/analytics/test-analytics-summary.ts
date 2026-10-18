import { initializeDatabase, db } from '../../db/index.ts';
import { securityEvents, alerts, incidents, users } from '../../db/schema.ts';
import { AnalyticsService } from './analytics.service.ts';
import { eq } from 'drizzle-orm';

async function runAnalyticsSummaryTests() {
  console.log('[Analytics Test] Initializing database...');
  await initializeDatabase();

  console.log('[Analytics Test] 1. Testing AnalyticsService.getSummary("24h")...');
  const summary24h = await AnalyticsService.getSummary('24h');

  if (summary24h.timeRange !== '24h') {
    throw new Error(`Expected timeRange '24h', got '${summary24h.timeRange}'`);
  }
  if (!summary24h.windowStart || !summary24h.windowEnd) {
    throw new Error('windowStart or windowEnd missing');
  }

  const start24h = new Date(summary24h.windowStart).getTime();
  const end24h = new Date(summary24h.windowEnd).getTime();
  const diffHours24 = (end24h - start24h) / (1000 * 60 * 60);
  if (Math.abs(diffHours24 - 24) > 0.1) {
    throw new Error(`Expected 24h window difference, got ${diffHours24}h`);
  }
  console.log(`✓ 24h window span confirmed: ${summary24h.windowStart} to ${summary24h.windowEnd}`);

  console.log('[Analytics Test] 2. Testing 7d and 30d window ranges...');
  const summary7d = await AnalyticsService.getSummary('7d');
  const diffDays7 = (new Date(summary7d.windowEnd).getTime() - new Date(summary7d.windowStart).getTime()) / (1000 * 60 * 60 * 24);
  if (Math.abs(diffDays7 - 7) > 0.1) {
    throw new Error(`Expected 7d window difference, got ${diffDays7}d`);
  }
  console.log('✓ 7d window span confirmed.');

  const summary30d = await AnalyticsService.getSummary('30d');
  const diffDays30 = (new Date(summary30d.windowEnd).getTime() - new Date(summary30d.windowStart).getTime()) / (1000 * 60 * 60 * 24);
  if (Math.abs(diffDays30 - 30) > 0.1) {
    throw new Error(`Expected 30d window difference, got ${diffDays30}d`);
  }
  console.log('✓ 30d window span confirmed.');

  console.log('[Analytics Test] 3. Testing MTTD latency accuracy with controlled event & alert...');
  // Controlled detection timestamp 20 seconds prior to alert creation
  const now = new Date();
  const eventDetectedAt = new Date(now.getTime() - 20000); // 20s prior

  const [testEvent] = await db
    .insert(securityEvents)
    .values({
      timestamp: eventDetectedAt,
      generatorId: 1,
      signatureId: 2099999,
      signatureRevision: 1,
      signatureMessage: 'ET TEST Analytics MTTD Calibration Event',
      classification: 'Test Telemetry',
      priority: 1,
      protocol: 'TCP',
      sourceIp: '198.51.100.200',
      destinationIp: '192.168.1.50',
      createdAt: now,
    })
    .returning();

  const [testAlert] = await db
    .insert(alerts)
    .values({
      securityEventId: testEvent.id,
      title: 'MTTD Calibration Alert',
      severity: 'HIGH',
      status: 'NEW',
      sourceIp: '198.51.100.200',
      destinationIp: '192.168.1.50',
      signatureId: 2099999,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const summaryWithMttd = await AnalyticsService.getSummary('24h');
  console.log(`✓ MTTD Status: ${summaryWithMttd.mttd.status}, Samples: ${summaryWithMttd.mttd.sampleCount}, Average: ${summaryWithMttd.mttd.averageSeconds}s`);

  if (summaryWithMttd.mttd.sampleCount < 1) {
    throw new Error('Expected at least 1 MTTD sample count');
  }
  if (summaryWithMttd.mttd.averageSeconds === null || summaryWithMttd.mttd.averageSeconds < 0) {
    throw new Error(`Invalid MTTD averageSeconds: ${summaryWithMttd.mttd.averageSeconds}`);
  }

  // Cleanup test records
  await db.delete(alerts).where(eq(alerts.id, testAlert.id));
  await db.delete(securityEvents).where(eq(securityEvents.id, testEvent.id));
  console.log('✓ Test records cleaned up.');

  console.log('[Analytics Test] ALL SUMMARY ANALYTICS TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runAnalyticsSummaryTests().catch((err) => {
  console.error('[Analytics Test FAILED]:', err);
  process.exit(1);
});
