import http from 'node:http';
import { WebSocket } from 'ws';
import { initializeDatabase, db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { AuthService } from '../auth/auth.service.ts';
import { RealtimeGateway } from './gateway.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function runGatewayTests() {
  console.log('===============================================================');
  console.log('       NETGUARD V2.2 REALTIME GATEWAY TEST SUITE               ');
  console.log('===============================================================');

  console.log('\n[Phase 1] Database & Test Server Initialization...');
  await initializeDatabase();

  const pwdHash = await bcrypt.hash('GatewayTest123!', 10);
  const [testUser] = await db
    .insert(users)
    .values({
      email: `gateway_test_${Date.now()}@netguard.local`,
      passwordHash: pwdHash,
      role: 'ADMIN',
      isActive: true,
    })
    .returning();

  const validToken = AuthService.signToken({
    id: testUser.id,
    email: testUser.email,
    role: testUser.role,
  });

  // Setup standalone test HTTP server
  const testServer = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });

  const gateway = new RealtimeGateway();
  gateway.attach(testServer);

  const testPort = 3099;
  await new Promise<void>((resolve) => {
    testServer.listen(testPort, '127.0.0.1', () => {
      console.log(`✓ Test WebSocket gateway server listening on port ${testPort}`);
      resolve();
    });
  });

  try {
    // Phase 2: Test connection rejection without token
    console.log('\n[Phase 2] Testing Connection Handshake Rejection Without Token...');
    let unauthRejected = false;
    await new Promise<void>((resolve) => {
      const wsNoToken = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
      wsNoToken.on('error', (err) => {
        unauthRejected = true;
      });
      wsNoToken.on('unexpected-response', (_req, res) => {
        if (res.statusCode === 401) {
          unauthRejected = true;
        }
        resolve();
      });
      wsNoToken.on('open', () => {
        wsNoToken.close();
        resolve();
      });
    });

    if (!unauthRejected) {
      throw new Error('Expected connection without token to be rejected with HTTP 401.');
    }
    console.log('✓ Rejected connection without token (HTTP 401).');

    // Phase 3: Test connection rejection with invalid token
    console.log('\n[Phase 3] Testing Connection Handshake Rejection With Invalid Token...');
    let invalidRejected = false;
    await new Promise<void>((resolve) => {
      const wsBadToken = new WebSocket(`ws://127.0.0.1:${testPort}/ws?token=bogus_token_xyz`);
      wsBadToken.on('error', () => {
        invalidRejected = true;
      });
      wsBadToken.on('unexpected-response', (_req, res) => {
        if (res.statusCode === 401) {
          invalidRejected = true;
        }
        resolve();
      });
      wsBadToken.on('open', () => {
        wsBadToken.close();
        resolve();
      });
    });

    if (!invalidRejected) {
      throw new Error('Expected connection with invalid token to be rejected with HTTP 401.');
    }
    console.log('✓ Rejected connection with invalid token (HTTP 401).');

    // Phase 4: Test successful connection with valid JWT
    console.log('\n[Phase 4] Testing Successful Handshake With Valid JWT Bearer Token...');
    const clientWs = new WebSocket(`ws://127.0.0.1:${testPort}/ws?token=${validToken}`);

    let welcomeReceived = false;
    let welcomePayload: any = null;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

      clientWs.on('open', () => {
        console.log('✓ WebSocket connection established successfully.');
      });

      clientWs.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.event === 'gateway:connected') {
          welcomeReceived = true;
          welcomePayload = parsed;
          clearTimeout(timeout);
          resolve();
        }
      });

      clientWs.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    if (!welcomeReceived || welcomePayload?.data?.userId !== testUser.id) {
      throw new Error('Failed to receive valid gateway:connected welcome handshake.');
    }
    console.log(`✓ Welcome message verified: user #${welcomePayload.data.userId} (${welcomePayload.data.role})`);
    console.log(`✓ Gateway active client count: ${gateway.getClientCount()}`);

    // Phase 5: Test domain event broadcast
    console.log('\n[Phase 5] Testing Domain Event Broadcast Delivery...');
    let broadcastReceived = false;
    let broadcastPayload: any = null;

    const broadcastPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Broadcast receive timeout')), 5000);

      clientWs.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.event === 'alert:created') {
          broadcastReceived = true;
          broadcastPayload = parsed;
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Gateway broadcasts alert:created
    gateway.broadcast('alert:created', {
      id: 999,
      title: 'Realtime Gateway Test Alert',
      severity: 'CRITICAL',
    });

    await broadcastPromise;

    if (!broadcastReceived || broadcastPayload?.data?.id !== 999) {
      throw new Error('Broadcast event failed or mismatched payload.');
    }
    console.log(`✓ Broadcast verified: event "${broadcastPayload.event}" at ${broadcastPayload.timestamp}`);
    console.log(`  Payload: ${JSON.stringify(broadcastPayload.data)}`);

    // Phase 6: Graceful teardown
    console.log('\n[Phase 6] Testing Client Disconnect & Socket Teardown...');
    clientWs.close();
    await new Promise((r) => setTimeout(r, 200));

    console.log(`✓ Gateway client count after disconnect: ${gateway.getClientCount()}`);

    // Cleanup DB and Server
    await db.delete(users).where(eq(users.id, testUser.id));
    gateway.close();
    testServer.close();

    console.log('\n===============================================================');
    console.log('   ★ NETGUARD V2.2 REALTIME GATEWAY TESTS COMPLETED 100% ★    ');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ [GATEWAY TEST FAILED]:', err);
    try {
      await db.delete(users).where(eq(users.id, testUser.id));
      gateway.close();
      testServer.close();
    } catch {}
    process.exit(1);
  }
}

runGatewayTests();
