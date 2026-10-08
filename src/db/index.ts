import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

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
    const pool = global._pgPool || new Pool(
      databaseUrl
        ? { connectionString: databaseUrl }
        : {
            host: process.env.SQL_HOST,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DB_NAME,
            port: Number(process.env.SQL_PORT || 5432),
            max: 10,
            connectionTimeoutMillis: 15000,
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
  const database = getDb();

  if (global._rawPglite) {
    await global._rawPglite.waitReady;
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
}
