# 06 — Data Model & Database Architecture

## 1. Overview
NetGuard uses **PostgreSQL** with **Drizzle ORM**. This document describes the authoritative schema definitions, relationships, constraints, and indexes across V0 and V1.

---

## 2. Enums

### `user_role`
- Values: `'ADMIN'`, `'ANALYST'`, `'VIEWER'`
- Purpose: Grants system-wide role-based permissions.

### `alert_severity`
- Values: `'CRITICAL'`, `'HIGH'`, `'MEDIUM'`, `'LOW'`
- Mapping from Snort Event Priority:
  - Priority 1 $\rightarrow$ `CRITICAL` or `HIGH`
  - Priority 2 $\rightarrow$ `MEDIUM`
  - Priority 3 $\rightarrow$ `LOW`

### `alert_status`
- Values: `'NEW'`, `'IN_PROGRESS'`, `'RESOLVED'`, `'DISMISSED'`

### `incident_severity`
- Values: `'SEV1'` (Critical), `'SEV2'` (High), `'SEV3'` (Medium), `'SEV4'` (Low)

### `incident_status`
- Values: `'OPEN'`, `'INVESTIGATING'`, `'CONTAINED'`, `'RESOLVED'`, `'CLOSED'`

### `investigation_entry_type`
- Values: `'NOTE'`, `'ACTION_TAKEN'`, `'CONTAINMENT'`, `'EVIDENCE'`

---

## 3. Tables & Schemas

### 3.1 `users` (V0)
Stores operator credentials and access roles.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique operator ID |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | Login email address |
| `password_hash` | TEXT | NOT NULL | Bcrypt hashed password |
| `role` | user_role | NOT NULL, DEFAULT 'VIEWER' | RBAC access level |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | Account status toggle |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Registration timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last profile modification |

---

### 3.2 `security_events` (V0)
Stores raw, immutable intrusion telemetry ingested from Snort sensors.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique event sequence ID |
| `timestamp` | TIMESTAMPTZ | NOT NULL | Detection time reported by Snort |
| `generator_id` | INTEGER | NOT NULL, DEFAULT 1 | Snort GID |
| `signature_id` | INTEGER | NOT NULL | Snort SID |
| `signature_revision` | INTEGER | NOT NULL, DEFAULT 1 | Snort Rev |
| `signature_message` | TEXT | NOT NULL | Human-readable alert string |
| `classification` | VARCHAR(255) | NULLABLE | Snort attack class |
| `priority` | INTEGER | NOT NULL, DEFAULT 3 | Raw severity: 1 (High) to 4 (Info) |
| `protocol` | VARCHAR(32) | NOT NULL | Network protocol (TCP, UDP, etc.) |
| `source_ip` | VARCHAR(64) | NOT NULL | Origin IPv4/IPv6 |
| `source_port` | INTEGER | NULLABLE | Origin port (0–65535) |
| `destination_ip` | VARCHAR(64) | NOT NULL | Target IPv4/IPv6 |
| `destination_port` | INTEGER | NULLABLE | Target port (0–65535) |
| `raw_payload` | TEXT | NULLABLE | Hex/ASCII packet snippet |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | System ingestion timestamp |

**Indexes**:
- `idx_events_timestamp` ON `security_events (timestamp)`
- `idx_events_priority` ON `security_events (priority)`
- `idx_events_signature` ON `security_events (signature_id)`
- `idx_events_source_ip` ON `security_events (source_ip)`
- `idx_events_dest_ip` ON `security_events (destination_ip)`

---

### 3.3 `alerts` (V1 Addition)
Stores actionable alerts promoted from security events or created by operators.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique alert ID |
| `security_event_id` | INTEGER | REFERENCES security_events(id) ON DELETE SET NULL | Source telemetry event link |
| `title` | VARCHAR(255) | NOT NULL | Alert title |
| `description` | TEXT | NULLABLE | Detailed description / context |
| `severity` | alert_severity | NOT NULL | Actionable severity level |
| `status` | alert_status | NOT NULL, DEFAULT 'NEW' | Lifecycle status |
| `source_ip` | VARCHAR(64) | NOT NULL | Origin IP address |
| `destination_ip` | VARCHAR(64) | NOT NULL | Target IP address |
| `signature_id` | INTEGER | NOT NULL | Associated Snort SID |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_alerts_status` ON `alerts (status)`
- `idx_alerts_severity` ON `alerts (severity)`
- `idx_alerts_source_ip` ON `alerts (source_ip)`
- `idx_alerts_event_id` ON `alerts (security_event_id)`

---

### 3.4 `incidents` (V1 Addition)
Represents a formal security incident coordinating triage, investigation, and resolution.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Unique incident identifier |
| `title` | VARCHAR(255) | NOT NULL | Incident title |
| `description` | TEXT | NOT NULL | Scope & initial assessment |
| `severity` | incident_severity | NOT NULL | Impact rating (SEV1–SEV4) |
| `status` | incident_status | NOT NULL, DEFAULT 'OPEN' | Investigation status |
| `assigned_to` | INTEGER | REFERENCES users(id) ON DELETE SET NULL | Assigned operator |
| `created_by` | INTEGER | REFERENCES users(id) ON DELETE SET NULL | Creator operator |
| `resolved_at` | TIMESTAMPTZ | NULLABLE | Timestamp of resolution |
| `resolution_summary`| TEXT | NULLABLE | Findings & closure rationale |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_incidents_status` ON `incidents (status)`
- `idx_incidents_severity` ON `incidents (severity)`
- `idx_incidents_assigned_to` ON `incidents (assigned_to)`

---

### 3.5 `incident_alerts` (V1 Addition)
Junction table grouping alerts into incidents.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `incident_id` | INTEGER | NOT NULL, REFERENCES incidents(id) ON DELETE CASCADE | Parent incident |
| `alert_id` | INTEGER | NOT NULL, REFERENCES alerts(id) ON DELETE CASCADE | Associated alert |
| `added_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Association timestamp |
| `added_by` | INTEGER | REFERENCES users(id) ON DELETE SET NULL | Operator who linked alert |

**Primary Key**: `(incident_id, alert_id)`

---

### 3.6 `investigation_entries` (V1 Addition)
Chronological log of notes, containment actions, and evidence for an incident.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Entry identifier |
| `incident_id` | INTEGER | NOT NULL, REFERENCES incidents(id) ON DELETE CASCADE | Target incident |
| `author_id` | INTEGER | REFERENCES users(id) ON DELETE SET NULL | Operator author |
| `entry_type` | investigation_entry_type | NOT NULL, DEFAULT 'NOTE' | Category of entry |
| `content` | TEXT | NOT NULL | Investigation entry text |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Recorded timestamp |

**Indexes**:
- `idx_investigation_incident` ON `investigation_entries (incident_id)`
- `idx_investigation_created` ON `investigation_entries (created_at)`
