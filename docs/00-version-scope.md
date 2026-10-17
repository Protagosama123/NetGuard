# 00 — Version Scope & Boundaries

## Purpose & Scope
This document defines the strict functional boundaries between NetGuard releases. It prevents scope creep, preserves V0 functionality, and explicitly clarifies what belongs in V1 versus future releases.

---

## 1. Version 0 — Foundation (Completed & Verified)
V0 established the architectural base, ingestion boundary, database persistence, and core operator interfaces.

- **Authentication & Authorization**:
  - Secure Bcrypt password hashing (salt rounds = 10).
  - 24-hour signed JWT Bearer tokens.
  - Three distinct operator roles: `ADMIN`, `ANALYST`, `VIEWER`.
  - Self-service registration (first user becomes `ADMIN`, subsequent users become `VIEWER`).
- **Snort Telemetry Ingestion**:
  - `POST /api/events/ingest` accepting single and bulk alert payloads.
  - Strict payload validation: `timestamp`, `generatorId`, `signatureId`, `signatureRevision`, `signatureMessage`, `classification`, `priority`, `protocol`, `sourceIp`, `sourcePort`, `destinationIp`, `destinationPort`, `rawPayload`.
  - Authenticated via session Bearer token (`ADMIN` or `ANALYST`) or `X-Ingest-Key` / `X-API-Key` header.
- **Telemetry Query & Inspection**:
  - Paginated query API (`GET /api/events`) with priority, protocol, IP, and search filters.
  - Event detail viewer with formatted raw packet payload and clipboard copy.
- **Administration & Safety Guardrails**:
  - Admin-only directory (`GET /api/users`), role modification, and account deactivation.
  - Guardrail preventing sole active administrator from self-demotion or self-deactivation.
- **Documentation**:
  - OpenAPI 3.0 specification (`/api/docs/openapi.json`) and Swagger UI (`/api/docs`).

---

## 2. Version 1 — Security Operations (Current Target)
V1 introduces operational triage, investigation, incident management, and ownership workflows on top of V0 telemetry.

### Core V1 Features
1. **Alert Management**:
   - Distinct `alerts` table separated from raw `security_events`.
   - Immutable security events can trigger or be associated with mutable alerts.
   - Statuses: `NEW`, `IN_PROGRESS`, `RESOLVED`, `DISMISSED`.
   - Severities: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`.
2. **Incident Management**:
   - `incidents` table for multi-alert grouping and security investigations.
   - Join table `incident_alerts` supporting many-to-many relationships.
   - Statuses: `OPEN`, `INVESTIGATING`, `CONTAINED`, `RESOLVED`, `CLOSED`.
   - Severities: `SEV1`, `SEV2`, `SEV3`, `SEV4`.
3. **Investigation Workflow**:
   - `investigation_entries` recording notes, containment steps, and evidence.
   - Strongly attributed to authenticated author with UTC timestamp.
4. **Ownership & Assignment**:
   - Incident assignment restricted to active `ADMIN` or `ANALYST` operators.
   - Assignment state kept orthogonal to lifecycle status.
5. **Basic SOC Dashboard**:
   - High-level alert and incident summaries.
   - Urgent triage queue and recent incident listing.
   - Standard REST polling; zero realtime/WebSocket dependencies.

---

## 3. Explicitly Outside V1 (Deferred to V2+)
The following capabilities must **not** be implemented in V1:
- Real-time WebSockets or server-sent events.
- Mean Time to Detect (MTTD) or Mean Time to Respond (MTTR) analytics.
- Automated network blocking, SDN integration, or firewall rule injection.
- Complex multi-stage playbooks or escalation approval chains.
- Dedicated compliance audit logging subsystem.
- Microservices, message queues (Kafka, RabbitMQ, Redis).
