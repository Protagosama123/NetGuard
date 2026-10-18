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
  primaryKey,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

/**
 * NetGuard User Roles
 * - ADMIN: Full access (User management, system config, all security operations)
 * - ANALYST: Security event ingestion, alert/incident operations, investigation
 * - VIEWER: Read-only access to security event telemetry and operational views
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

/**
 * NetGuard V1 Alert Enums
 */
export const alertSeverityEnum = pgEnum('alert_severity', ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export const alertStatusEnum = pgEnum('alert_status', ['NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']);

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

/**
 * NetGuard V1 Alerts Entity
 * Actionable alerts promoted from raw security events or created by operators
 */
export const alerts = pgTable(
  'alerts',
  {
    id: serial('id').primaryKey(),
    // Optional link to underlying raw Snort security event
    securityEventId: integer('security_event_id').references(() => securityEvents.id, { onDelete: 'set null' }),
    // Actionable alert title
    title: varchar('title', { length: 255 }).notNull(),
    // Context or investigation summary
    description: text('description'),
    // Actionable severity rating
    severity: alertSeverityEnum('severity').notNull(),
    // Operational triage status
    status: alertStatusEnum('status').notNull().default('NEW'),
    // Host IP endpoints
    sourceIp: varchar('source_ip', { length: 64 }).notNull(),
    destinationIp: varchar('destination_ip', { length: 64 }).notNull(),
    // Snort Signature ID
    signatureId: integer('signature_id').notNull(),
    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_alerts_status').on(table.status),
    index('idx_alerts_severity').on(table.severity),
    index('idx_alerts_source_ip').on(table.sourceIp),
    index('idx_alerts_event_id').on(table.securityEventId),
  ]
);

export type Alert = InferSelectModel<typeof alerts>;
export type NewAlert = InferInsertModel<typeof alerts>;

/**
 * NetGuard V1 Incident Enums
 */
export const incidentSeverityEnum = pgEnum('incident_severity', ['SEV1', 'SEV2', 'SEV3', 'SEV4']);
export const incidentStatusEnum = pgEnum('incident_status', ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED']);

export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';

/**
 * NetGuard V1 Incidents Entity
 */
export const incidents = pgTable(
  'incidents',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    severity: incidentSeverityEnum('severity').notNull(),
    status: incidentStatusEnum('status').notNull().default('OPEN'),
    assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionSummary: text('resolution_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_incidents_status').on(table.status),
    index('idx_incidents_severity').on(table.severity),
    index('idx_incidents_assigned_to').on(table.assignedTo),
  ]
);

export type Incident = InferSelectModel<typeof incidents>;
export type NewIncident = InferInsertModel<typeof incidents>;

/**
 * NetGuard V1 Incident-Alerts Junction Entity
 */
export const incidentAlerts = pgTable(
  'incident_alerts',
  {
    incidentId: integer('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    alertId: integer('alert_id')
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    primaryKey({ columns: [table.incidentId, table.alertId] }),
  ]
);

export type IncidentAlert = InferSelectModel<typeof incidentAlerts>;
export type NewIncidentAlert = InferInsertModel<typeof incidentAlerts>;

/**
 * NetGuard V1 Investigation Entry Enums & Entity
 */
export const investigationEntryTypeEnum = pgEnum('investigation_entry_type', [
  'NOTE',
  'ACTION_TAKEN',
  'CONTAINMENT',
  'EVIDENCE',
]);

export type InvestigationEntryType = 'NOTE' | 'ACTION_TAKEN' | 'CONTAINMENT' | 'EVIDENCE';

export const investigationEntries = pgTable(
  'investigation_entries',
  {
    id: serial('id').primaryKey(),
    incidentId: integer('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    entryType: investigationEntryTypeEnum('entry_type').notNull().default('NOTE'),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_investigation_incident').on(table.incidentId),
    index('idx_investigation_created').on(table.createdAt),
  ]
);

export type InvestigationEntry = InferSelectModel<typeof investigationEntries>;
export type NewInvestigationEntry = InferInsertModel<typeof investigationEntries>;

/**
 * NetGuard V2.2 Administrative Audit Logs Entity
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: varchar('actor_email', { length: 255 }),
    action: varchar('action', { length: 100 }).notNull(),
    targetEntity: varchar('target_entity', { length: 100 }).notNull(),
    targetId: integer('target_id'),
    details: text('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_actor').on(table.actorId),
    index('idx_audit_action').on(table.action),
    index('idx_audit_created').on(table.createdAt),
  ]
);

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type NewAuditLog = InferInsertModel<typeof auditLogs>;


