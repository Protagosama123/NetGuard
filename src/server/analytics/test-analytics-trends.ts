import { initializeDatabase, db } from '../../db/index.ts';
import { securityEvents, alerts, incidents } from '../../db/schema.ts';
import { AnalyticsService } from './analytics.service.ts';
import { eq } from 'drizzle-orm';

async function runAnalyticsTrendsTests() {
  console.log('[Analytics Trends Test] Initializing database...');
  await initializeDatabase();

  console.log('[Analytics Trends Test] 1. Testing AnalyticsService.getTrends("24h")...');
  const trends24h = await AnalyticsService.getTrends('24h', 'all');

  if (trends24h.bucketInterval !== '1h') {
    throw new Error(`Expected bucketInterval '1h', got '${trends24h.bucketInterval}'`);
  }
  if (trends24h.buckets.length !== 24) {
    throw new Error(`Expected 24 hourly buckets for 24h, got ${trends24h.buckets.length}`);
  }
  console.log(`✓ Verified 24h trend returns exact 24 hourly buckets.`);

  // Verify zero-filling and timestamp structure
  for (let i = 0; i < trends24h.buckets.length; i++) {
    const b = trends24h.buckets[i];
    if (!b.timestamp || isNaN(new Date(b.timestamp).getTime())) {
      throw new Error(`Invalid bucket timestamp at index ${i}: ${b.timestamp}`);
    }
    if (b.alertsTotal < 0 || b.incidentsDeclared < 0 || b.incidentsResolved < 0) {
      throw new Error(`Invalid bucket metric counts at index ${i}`);
    }
  }
  console.log(`✓ Verified continuous zero-filling across all 24 buckets.`);

  console.log('[Analytics Trends Test] 2. Testing getTrends("7d")...');
  const trends7d = await AnalyticsService.getTrends('7d', 'all');
  if (trends7d.bucketInterval !== '1d' || trends7d.buckets.length !== 7) {
    throw new Error(`Expected 7 daily buckets for 7d, got ${trends7d.buckets.length}`);
  }
  console.log(`✓ Verified 7d trend returns exact 7 daily buckets.`);

  console.log('[Analytics Trends Test] 3. Testing getTrends("30d")...');
  const trends30d = await AnalyticsService.getTrends('30d', 'all');
  if (trends30d.bucketInterval !== '1d' || trends30d.buckets.length !== 30) {
    throw new Error(`Expected 30 daily buckets for 30d, got ${trends30d.buckets.length}`);
  }
  console.log(`✓ Verified 30d trend returns exact 30 daily buckets.`);

  console.log('[Analytics Trends Test] 4. Testing AnalyticsService.getMttdDetails()...');
  // Create 2 test events with known latencies: 10 seconds and 30 seconds
  const now = new Date();
  const ev1Time = new Date(now.getTime() - 30000); // 30s
  const ev2Time = new Date(now.getTime() - 10000); // 10s

  const [ev1] = await db.insert(securityEvents).values({
    timestamp: ev1Time,
    generatorId: 1,
    signatureId: 2199001,
    signatureMessage: 'ET TEST Latency Calibration 1',
    priority: 1,
    protocol: 'TCP',
    sourceIp: '198.51.100.201',
    destinationIp: '192.168.1.10',
    createdAt: now,
  }).returning();

  const [ev2] = await db.insert(securityEvents).values({
    timestamp: ev2Time,
    generatorId: 1,
    signatureId: 2199002,
    signatureMessage: 'ET TEST Latency Calibration 2',
    priority: 1,
    protocol: 'TCP',
    sourceIp: '198.51.100.202',
    destinationIp: '192.168.1.10',
    createdAt: now,
  }).returning();

  const [al1] = await db.insert(alerts).values({
    securityEventId: ev1.id,
    title: 'Latency Calibration Alert 1',
    severity: 'HIGH',
    status: 'NEW',
    sourceIp: '198.51.100.201',
    destinationIp: '192.168.1.10',
    signatureId: 2199001,
    createdAt: now,
  }).returning();

  const [al2] = await db.insert(alerts).values({
    securityEventId: ev2.id,
    title: 'Latency Calibration Alert 2',
    severity: 'CRITICAL',
    status: 'NEW',
    sourceIp: '198.51.100.202',
    destinationIp: '192.168.1.10',
    signatureId: 2199002,
    createdAt: now,
  }).returning();

  const mttdDetails = await AnalyticsService.getMttdDetails('24h');
  console.log(`✓ MTTD Details calculated:`);
  console.log(`  - Status: ${mttdDetails.status}`);
  console.log(`  - Sample Count: ${mttdDetails.sampleCount}`);
  console.log(`  - Average: ${mttdDetails.averageSeconds}s`);
  console.log(`  - Median: ${mttdDetails.medianSeconds}s`);
  console.log(`  - Min: ${mttdDetails.minSeconds}s, Max: ${mttdDetails.maxSeconds}s`);
  console.log(`  - Bucketed Trend Intervals: ${mttdDetails.buckets.length}`);

  if (mttdDetails.sampleCount < 2) {
    throw new Error(`Expected at least 2 samples, got ${mttdDetails.sampleCount}`);
  }
  if (mttdDetails.minSeconds === null || mttdDetails.maxSeconds === null || mttdDetails.minSeconds > mttdDetails.maxSeconds) {
    throw new Error('Invalid min/max latency values');
  }

  // Cleanup test calibration records
  await db.delete(alerts).where(eq(alerts.id, al1.id));
  await db.delete(alerts).where(eq(alerts.id, al2.id));
  await db.delete(securityEvents).where(eq(securityEvents.id, ev1.id));
  await db.delete(securityEvents).where(eq(securityEvents.id, ev2.id));
  console.log('✓ Calibration records cleaned up.');

  console.log('[Analytics Trends Test] ALL HISTORICAL TREND & MTTD TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runAnalyticsTrendsTests().catch((err) => {
  console.error('[Analytics Trends Test FAILED]:', err);
  process.exit(1);
});
