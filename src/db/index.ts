import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import * as schema from './schema.ts';

// Type definition for our Drizzle database client instance
export type NetGuardDb = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var _netguardDb: NetGuardDb | undefined;
  // eslint-disable-next-line no-var
  var _pgPool: pg.Pool | undefined;
  // eslint-disable-next-line no-var
  var _rawPglite: PGlite | undefined;
}

/**
 * Initializes and returns the NetGuard database instance.
 * Supports:
 * 1. Standard PostgreSQL via pg.Pool if SQL_HOST or DATABASE_URL is set.
 * 2. Embedded PostgreSQL engine (@electric-sql/pglite) with disk persistence
 *    for zero-friction local/container environments.
 */
export function getDb(): NetGuardDb {
  if (global._netguardDb) {
    return global._netguardDb;
  }

  const sqlHost = process.env.SQL_HOST;
  const databaseUrl = process.env.DATABASE_URL;

  if (sqlHost || databaseUrl) {
    const pool = new pg.Pool(
      databaseUrl
        ? { connectionString: databaseUrl }
        : {
            host: sqlHost,
            port: Number(process.env.SQL_PORT || 5432),
            user: process.env.SQL_USER || 'postgres',
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DATABASE || 'netguard',
          }
    );

    pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });

    global._pgPool = pool;
    global._netguardDb = drizzlePg(pool, { schema });
    return global._netguardDb;
  }

  // Persistent in-process PostgreSQL database for container runtime
  const isTest = process.env.NODE_ENV === 'test' || process.env.PG_IN_MEMORY === 'true';
  let pglite: PGlite;
  if (isTest) {
    pglite = new PGlite();
  } else {
    fs.mkdirSync('./.data/netguard_pg', { recursive: true });
    pglite = new PGlite('./.data/netguard_pg');
  }
  global._rawPglite = pglite;
  global._netguardDb = drizzlePglite(pglite, { schema });
  return global._netguardDb;
}

export const db = getDb();

/**
 * Ensures table existence and base bootstrap schemas exist
 */
export async function initializeDatabase(): Promise<void> {
  let database = getDb();

  if (global._rawPglite) {
    try {
      await global._rawPglite.waitReady;
    } catch (err) {
      console.warn('[DB] Persistent PGlite failed ready check, recovering fresh database...', err);
      try {
        fs.rmSync('./.data/netguard_pg', { recursive: true, force: true });
        fs.mkdirSync('./.data/netguard_pg', { recursive: true });
        const freshPglite = new PGlite('./.data/netguard_pg');
        await freshPglite.waitReady;
        global._rawPglite = freshPglite;
        global._netguardDb = drizzlePglite(freshPglite, { schema });
        database = global._netguardDb;
      } catch (recErr) {
        console.warn('[DB] Disk recovery failed, using in-memory PGlite instance:', recErr);
        const memPglite = new PGlite();
        await memPglite.waitReady;
        global._rawPglite = memPglite;
        global._netguardDb = drizzlePglite(memPglite, { schema });
        database = global._netguardDb;
      }
    }
  }

  // Create enum type if it does not exist
  await database.execute(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create users table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role user_role NOT NULL DEFAULT 'VIEWER',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create security_events table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS security_events (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL,
      generator_id INTEGER NOT NULL DEFAULT 1,
      signature_id INTEGER NOT NULL,
      signature_revision INTEGER NOT NULL DEFAULT 1,
      signature_message TEXT NOT NULL,
      classification VARCHAR(255),
      priority INTEGER NOT NULL DEFAULT 3,
      protocol VARCHAR(32) NOT NULL,
      source_ip VARCHAR(64) NOT NULL,
      source_port INTEGER,
      destination_ip VARCHAR(64) NOT NULL,
      destination_port INTEGER,
      raw_payload TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create telemetry performance indexes individually
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON security_events (timestamp);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_events_priority ON security_events (priority);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_events_signature ON security_events (signature_id);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_events_source_ip ON security_events (source_ip);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_events_dest_ip ON security_events (destination_ip);`);

  // Create alert enums if they do not exist
  await database.execute(`
    DO $$ BEGIN
      CREATE TYPE alert_severity AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await database.execute(`
    DO $$ BEGIN
      CREATE TYPE alert_status AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create alerts table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      security_event_id INTEGER REFERENCES security_events(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      severity alert_severity NOT NULL,
      status alert_status NOT NULL DEFAULT 'NEW',
      source_ip VARCHAR(64) NOT NULL,
      destination_ip VARCHAR(64) NOT NULL,
      signature_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create alert indexes
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_alerts_source_ip ON alerts (source_ip);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_alerts_event_id ON alerts (security_event_id);`);

  // Create incident enums if they do not exist
  await database.execute(`
    DO $$ BEGIN
      CREATE TYPE incident_severity AS ENUM ('SEV1', 'SEV2', 'SEV3', 'SEV4');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await database.execute(`
    DO $$ BEGIN
      CREATE TYPE incident_status AS ENUM ('OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create incidents table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      severity incident_severity NOT NULL,
      status incident_status NOT NULL DEFAULT 'OPEN',
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      resolution_summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create incident indexes
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to ON incidents (assigned_to);`);

  // Create incident_alerts junction table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS incident_alerts (
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (incident_id, alert_id)
    );
  `);

  // Create investigation_entry_type enum if it does not exist
  await database.execute(`
    DO $$ BEGIN
      CREATE TYPE investigation_entry_type AS ENUM ('NOTE', 'ACTION_TAKEN', 'CONTAINMENT', 'EVIDENCE');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create investigation_entries table
  await database.execute(`
    CREATE TABLE IF NOT EXISTS investigation_entries (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      entry_type investigation_entry_type NOT NULL DEFAULT 'NOTE',
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Create investigation indexes
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_investigation_incident ON investigation_entries (incident_id);`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_investigation_created ON investigation_entries (created_at);`);

  // Seed default admin user if not present
  try {
    const adminCheck = await database.execute(`SELECT id FROM users WHERE email = 'lead_admin@netguard.local' LIMIT 1;`);
    if (!adminCheck.rows || adminCheck.rows.length === 0) {
      const hash = await bcrypt.hash('SecurePassword123!', 10);
      await database.execute(`
        INSERT INTO users (email, password_hash, role, is_active)
        VALUES ('lead_admin@netguard.local', '${hash}', 'ADMIN', true)
        ON CONFLICT (email) DO NOTHING;
      `);
      console.log('[NetGuard Backend] Bootstrap administrator account verified: lead_admin@netguard.local');
    }
  } catch (seedErr) {
    console.error('[NetGuard Backend] Error checking/seeding admin:', seedErr);
  }

  // Seed initial Snort telemetry records if empty
  try {
    const eventsCheck = await database.execute(`SELECT COUNT(*) as count FROM security_events;`);
    const count = Number((eventsCheck.rows?.[0] as any)?.count || 0);
    if (count === 0) {
      await database.execute(`
        INSERT INTO security_events (timestamp, generator_id, signature_id, signature_revision, signature_message, classification, priority, protocol, source_ip, source_port, destination_ip, destination_port, raw_payload)
        VALUES
        (NOW() - INTERVAL '5 minutes', 1, 2001219, 4, 'ET SCAN Potential SSH Scan OUTBOUND', 'Attempted Information Leak', 1, 'TCP', '192.168.1.105', 49152, '10.0.0.1', 22, 'SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5'),
        (NOW() - INTERVAL '12 minutes', 1, 2100498, 7, 'GPL ATTACK_RESPONSE id check returned root', 'Privilege Escalation Attempt', 1, 'TCP', '198.51.100.44', 80, '192.168.1.50', 443, 'uid=0(root) gid=0(root) groups=0(root)'),
        (NOW() - INTERVAL '25 minutes', 1, 2014819, 2, 'ET WEB_SPECIFIC_APPS WordPress SQL Injection Union Select Attempt', 'Web Application Attack', 1, 'TCP', '203.0.113.88', 53412, '192.168.1.10', 80, 'GET /wp-admin/admin-ajax.php?action=query&id=1'' UNION SELECT 1,user_login,user_pass FROM wp_users-- HTTP/1.1'),
        (NOW() - INTERVAL '40 minutes', 1, 2002911, 3, 'ET SCAN Suspicious Inbound to MSSQL port 1433', 'Potentially Bad Traffic', 2, 'TCP', '203.0.113.12', 51234, '192.168.1.20', 1433, '00 00 00 1a 00 06 01 00 20 00 01 02 00 21 00 01'),
        (NOW() - INTERVAL '1 hour', 1, 2013028, 6, 'ET POLICY DNS Query to Suspicious Top Level Domain .top', 'Corporate Policy Violation', 3, 'UDP', '192.168.1.140', 57891, '1.1.1.1', 53, 'Standard query 0x1a2b A malware-c2-beacon.top'),
        (NOW() - INTERVAL '2 hours', 1, 2100499, 1, 'ICMP PING Sweeper Probe', 'Information Gathering', 4, 'ICMP', '198.51.100.44', NULL, '192.168.1.1', NULL, 'E..T..@.@...v...v.......c...............');
      `);
      console.log('[NetGuard Backend] Initial Snort telemetry records seeded.');
    }
  } catch (seedErr) {
    console.error('[NetGuard Backend] Error seeding telemetry alerts:', seedErr);
  }

  // Seed initial alerts if empty
  try {
    const alertsCheck = await database.execute(`SELECT COUNT(*) as count FROM alerts;`);
    const alertCount = Number((alertsCheck.rows?.[0] as any)?.count || 0);
    if (alertCount === 0) {
      await database.execute(`
        INSERT INTO alerts (security_event_id, title, description, severity, status, source_ip, destination_ip, signature_id, created_at, updated_at)
        SELECT 
          id,
          signature_message,
          CONCAT('Snort Detection Alert [SID:', signature_id, '] - ', COALESCE(classification, 'General Attack')),
          CASE 
            WHEN priority = 1 AND signature_id = 2100498 THEN 'CRITICAL'::alert_severity
            WHEN priority = 1 THEN 'HIGH'::alert_severity
            WHEN priority = 2 THEN 'MEDIUM'::alert_severity
            ELSE 'LOW'::alert_severity
          END,
          CASE 
            WHEN signature_id = 2100498 THEN 'NEW'::alert_status
            WHEN signature_id = 2001219 THEN 'IN_PROGRESS'::alert_status
            ELSE 'NEW'::alert_status
          END,
          source_ip,
          destination_ip,
          signature_id,
          timestamp,
          timestamp
        FROM security_events
        WHERE priority <= 2
        LIMIT 4;
      `);
      console.log('[NetGuard Backend] Initial operational alerts seeded from high-priority telemetry.');
    }
  } catch (seedErr) {
    console.error('[NetGuard Backend] Error seeding initial alerts:', seedErr);
  }

  // Seed initial incident if empty
  try {
    const incCheck = await database.execute(`SELECT COUNT(*) as count FROM incidents;`);
    const incCount = Number((incCheck.rows?.[0] as any)?.count || 0);
    if (incCount === 0) {
      const adminUser = await database.execute(`SELECT id FROM users WHERE email = 'lead_admin@netguard.local' LIMIT 1;`);
      const adminId = (adminUser.rows?.[0] as any)?.id || null;

      const incResult = await database.execute(`
        INSERT INTO incidents (title, description, severity, status, assigned_to, created_by, created_at, updated_at)
        VALUES (
          'INC-101: Lateral Privilege Escalation & Remote Command Execution',
          'Multiple critical intrusion signatures detected originating from external IP 198.51.100.44 targeting internal servers. Root-level response tokens observed.',
          'SEV1'::incident_severity,
          'INVESTIGATING'::incident_status,
          ${adminId ? adminId : 'NULL'},
          ${adminId ? adminId : 'NULL'},
          NOW() - INTERVAL '15 minutes',
          NOW() - INTERVAL '5 minutes'
        )
        RETURNING id;
      `);

      const newIncId = (incResult.rows?.[0] as any)?.id;
      if (newIncId) {
        // Associate the first two alerts with this incident
        await database.execute(`
          INSERT INTO incident_alerts (incident_id, alert_id, added_at, added_by)
          SELECT ${newIncId}, id, NOW(), ${adminId ? adminId : 'NULL'}
          FROM alerts
          WHERE severity IN ('CRITICAL', 'HIGH')
          LIMIT 2
          ON CONFLICT DO NOTHING;
        `);
      }
      console.log('[NetGuard Backend] Initial operational incident seeded with linked alerts.');
    }
  } catch (seedErr) {
    console.error('[NetGuard Backend] Error seeding initial incident:', seedErr);
  }

  // Seed initial investigation entries if empty
  try {
    const invCheck = await database.execute(`SELECT COUNT(*) as count FROM investigation_entries;`);
    const invCount = Number((invCheck.rows?.[0] as any)?.count || 0);
    if (invCount === 0) {
      const incRes = await database.execute(`SELECT id FROM incidents LIMIT 1;`);
      const firstIncId = (incRes.rows?.[0] as any)?.id;
      const adminUser = await database.execute(`SELECT id FROM users WHERE email = 'lead_admin@netguard.local' LIMIT 1;`);
      const adminId = (adminUser.rows?.[0] as any)?.id || null;

      if (firstIncId) {
        await database.execute(`
          INSERT INTO investigation_entries (incident_id, author_id, entry_type, content, created_at)
          VALUES
          (${firstIncId}, ${adminId ? adminId : 'NULL'}, 'NOTE', 'Initial triage completed. Correlated multiple privilege escalation attempts originating from 198.51.100.44.', NOW() - INTERVAL '10 minutes'),
          (${firstIncId}, ${adminId ? adminId : 'NULL'}, 'ACTION_TAKEN', 'Applied egress filtering and verified integrity of internal host 192.168.1.50.', NOW() - INTERVAL '6 minutes');
        `);
        console.log('[NetGuard Backend] Initial investigation timeline entries seeded.');
      }
    }
  } catch (seedErr) {
    console.error('[NetGuard Backend] Error seeding initial investigation entries:', seedErr);
  }
}
