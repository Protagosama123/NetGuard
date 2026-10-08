import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

/**
 * NetGuard V0 User Roles
 * - ADMIN: Full access (User management, system config, all security operations)
 * - ANALYST: Security event ingestion, telemetry exploration, filtering
 * - VIEWER: Read-only access to security event telemetry
 */
export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'ANALYST', 'VIEWER']);

/**
 * NetGuard Users Entity
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('VIEWER'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

/**
 * Snort Telemetry Event Entity
 *
 * Strict boundary:
 * "Snort detects. NetGuard manages."
 * This schema stores security telemetry output from Snort alert logs.
 */
export const securityEvents = pgTable(
  'security_events',
  {
    id: serial('id').primaryKey(),
    // Telemetry detection timestamp
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    // Snort GID (Generator ID, default 1 for standard rules)
    generatorId: integer('generator_id').notNull().default(1),
    // Snort SID (Signature ID)
    signatureId: integer('signature_id').notNull(),
    // Snort REV (Revision)
    signatureRevision: integer('signature_revision').notNull().default(1),
    // Alert Message description
    signatureMessage: text('signature_message').notNull(),
    // Alert Classification (e.g., "Attempted Administrator Privilege Gain", "Web Application Attack")
    classification: varchar('classification', { length: 255 }),
    // Priority: 1 = High, 2 = Medium, 3 = Low, 4 = Info
    priority: integer('priority').notNull().default(3),
    // Network Protocol: TCP, UDP, ICMP, IP, etc.
    protocol: varchar('protocol', { length: 32 }).notNull(),
    // Source host IP
    sourceIp: varchar('source_ip', { length: 64 }).notNull(),
    // Source port (nullable for non-port protocols)
    sourcePort: integer('source_port'),
    // Destination host IP
    destinationIp: varchar('destination_ip', { length: 64 }).notNull(),
    // Destination port (nullable)
    destinationPort: integer('destination_port'),
    // Optional raw payload or packet metadata
    rawPayload: text('raw_payload'),
    // NetGuard storage ingestion timestamp
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_events_timestamp').on(table.timestamp),
    index('idx_events_priority').on(table.priority),
    index('idx_events_signature').on(table.signatureId),
    index('idx_events_source_ip').on(table.sourceIp),
    index('idx_events_dest_ip').on(table.destinationIp),
  ]
);

export type SecurityEvent = InferSelectModel<typeof securityEvents>;
export type NewSecurityEvent = InferInsertModel<typeof securityEvents>;
