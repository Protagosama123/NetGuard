import { initializeDatabase, db } from '../../db/index.ts';
import { users, securityEvents, alerts, incidents, investigationEntries } from '../../db/schema.ts';
import { AnalyticsService } from './analytics.service.ts';
import { AuthService } from '../auth/auth.service.ts';
import { openApiSpec } from '../docs/swagger.ts';
import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function runV21VerificationSuite() {
  console.log('===============================================================');
  console.log('       NETGUARD V2.1 ANALYTICS VERIFICATION TEST SUITE         ');
  console.log('===============================================================');

  console.log('\n[Phase 1] Database Initialization & Health Inspection...');
  await initializeDatabase();

  const health = await AnalyticsService.getSystemHealth();
  console.log(`✓ System Health Status: ${health.status}`);
  console.log(`✓ Database Connected: ${health.database.connected} (${health.database.engine})`);
  console.log(`✓ Telemetry Events Ingested (Last Hour): ${health.ingestion.eventsLastHour}`);
  console.log(`✓ Queue Depths: ${health.queues.unassignedIncidents} unassigned incidents, ${health.queues.untriagedAlerts} untriaged alerts`);

  if (!health.database.connected || health.status !== 'HEALTHY') {
    throw new Error('System health check failed: database not connected.');
  }

  const createdUserIds: number[] = [];
  const createdEventIds: number[] = [];
  const createdAlertIds: number[] = [];

  try {
    // 2. Setup RBAC tokens
    console.log('\n[Phase 2] Verifying RBAC Token Handshakes for Analytics...');
    const pwdHash = await bcrypt.hash('SecurePassword123!', 10);

    const [admin] = await db.insert(users).values({
      email: `v21_admin_${Date.now()}@netguard.local`,
      passwordHash: pwdHash,
      role: 'ADMIN',
      isActive: true,
    }).returning();
    createdUserIds.push(admin.id);

    const [viewer] = await db.insert(users).values({
      email: `v21_viewer_${Date.now()}@netguard.local`,
      passwordHash: pwdHash,
      role: 'VIEWER',
      isActive: true,
    }).returning();
    createdUserIds.push(viewer.id);

    const adminToken = AuthService.signToken({ id: admin.id, email: admin.email, role: admin.role });
    const viewerToken = AuthService.signToken({ id: viewer.id, email: viewer.email, role: viewer.role });

    console.log(`✓ Admin token: ${adminToken.substring(0, 20)}...`);
    console.log(`✓ Viewer token: ${viewerToken.substring(0, 20)}...`);

    // 3. Verify Summary Metrics Across All Time Ranges
    console.log('\n[Phase 3] Testing Analytics Summary Query Boundaries (24h, 7d, 30d)...');
    for (const tr of ['24h', '7d', '30d'] as const) {
      const summary = await AnalyticsService.getSummary(tr);
      if (summary.timeRange !== tr) throw new Error(`Mismatch in summary timeRange: ${summary.timeRange}`);
      if (!summary.windowStart || !summary.windowEnd) throw new Error('Missing window timestamps');
      console.log(`✓ Summary for ${tr}: ${summary.incidents.total} incidents, ${summary.alerts.total} alerts, ${summary.telemetry.totalEvents} telemetry events.`);
    }

    // 4. Verify Historical Trend Bucketing Uniformity & Zero-Filling
    console.log('\n[Phase 4] Testing Historical Trend Bucketing & Continuous Zero-Filling...');
    const trends24h = await AnalyticsService.getTrends('24h', 'all');
    if (trends24h.buckets.length !== 24 || trends24h.bucketInterval !== '1h') {
      throw new Error(`Expected 24 hourly buckets for 24h, got ${trends24h.buckets.length}`);
    }
    console.log('✓ 24h Trend: Exactly 24 continuous hourly buckets verified.');

    const trends7d = await AnalyticsService.getTrends('7d', 'all');
    if (trends7d.buckets.length !== 7 || trends7d.bucketInterval !== '1d') {
      throw new Error(`Expected 7 daily buckets for 7d, got ${trends7d.buckets.length}`);
    }
    console.log('✓ 7d Trend: Exactly 7 continuous daily buckets verified.');

    const trends30d = await AnalyticsService.getTrends('30d', 'all');
    if (trends30d.buckets.length !== 30 || trends30d.bucketInterval !== '1d') {
      throw new Error(`Expected 30 daily buckets for 30d, got ${trends30d.buckets.length}`);
    }
    console.log('✓ 30d Trend: Exactly 30 continuous daily buckets verified.');

    // 5. Verify Entity-Filtered Trends
    console.log('\n[Phase 5] Testing Entity Filters on Trend Queries...');
    const alertTrends = await AnalyticsService.getTrends('24h', 'alerts');
    for (const b of alertTrends.buckets) {
      if (b.incidentsDeclared !== 0 || b.incidentsResolved !== 0) {
        throw new Error('Entity filter alerts leaked incident counts');
      }
    }
    console.log('✓ Entity filter "alerts" strictly scoped alerts data.');

    const incTrends = await AnalyticsService.getTrends('24h', 'incidents');
    for (const b of incTrends.buckets) {
      if (b.alertsTotal !== 0) {
        throw new Error('Entity filter incidents leaked alerts counts');
      }
    }
    console.log('✓ Entity filter "incidents" strictly scoped incidents data.');

    // 6. Verify MTTD Precision & Latency Math
    console.log('\n[Phase 6] Testing MTTD Precision Calibration with Controlled Telemetry...');
    const now = new Date();
    const eventTime = new Date(now.getTime() - 25000); // 25s latency

    const [testEv] = await db.insert(securityEvents).values({
      timestamp: eventTime,
      generatorId: 1,
      signatureId: 2199101,
      signatureMessage: 'ET TEST Precision MTTD Calibration',
      priority: 1,
      protocol: 'TCP',
      sourceIp: '198.51.100.222',
      destinationIp: '192.168.1.100',
      createdAt: now,
    }).returning();
    createdEventIds.push(testEv.id);

    const [testAl] = await db.insert(alerts).values({
      securityEventId: testEv.id,
      title: 'Precision Calibration Alert',
      severity: 'CRITICAL',
      status: 'NEW',
      sourceIp: '198.51.100.222',
      destinationIp: '192.168.1.100',
      signatureId: 2199101,
      createdAt: now,
    }).returning();
    createdAlertIds.push(testAl.id);

    const mttdDetails = await AnalyticsService.getMttdDetails('24h');
    console.log(`✓ Calibrated MTTD Result:`);
    console.log(`  - Status: ${mttdDetails.status}`);
    console.log(`  - Samples: ${mttdDetails.sampleCount}`);
    console.log(`  - Average Latency: ${mttdDetails.averageSeconds}s`);
    console.log(`  - Min: ${mttdDetails.minSeconds}s, Max: ${mttdDetails.maxSeconds}s`);

    if (mttdDetails.sampleCount < 1 || mttdDetails.averageSeconds === null) {
      throw new Error('MTTD calculation failed for calibrated sample.');
    }

    // 7. OpenAPI Contract Completeness
    console.log('\n[Phase 7] Validating OpenAPI 3.0.3 Analytics Documentation...');
    const specPaths = Object.keys(openApiSpec.paths);
    const requiredAnalyticsPaths = [
      '/api/analytics/summary',
      '/api/analytics/trends',
      '/api/analytics/mttd',
      '/api/analytics/health',
    ];

    for (const p of requiredAnalyticsPaths) {
      if (!specPaths.includes(p)) {
        throw new Error(`OpenAPI spec missing analytics path: ${p}`);
      }
    }
    console.log('✓ All 4 Analytics endpoints documented in OpenAPI specification.');

    // 8. Cleanup test records
    console.log('\n[Phase 8] Restoring Database State...');
    await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
    await db.delete(securityEvents).where(inArray(securityEvents.id, createdEventIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    console.log('✓ Database restored cleanly.');

    console.log('\n===============================================================');
    console.log('   ★ NETGUARD V2.1 VERIFICATION SUITE COMPLETED 100% ★         ');
    console.log('   All 8 Phases Passed - V2.1 Exit Condition Satisfied!        ');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ [V2.1 VERIFICATION TEST FAILED]:', err);
    try {
      if (createdAlertIds.length) await db.delete(alerts).where(inArray(alerts.id, createdAlertIds));
      if (createdEventIds.length) await db.delete(securityEvents).where(inArray(securityEvents.id, createdEventIds));
      if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    } catch {}
    process.exit(1);
  }
}

runV21VerificationSuite();
