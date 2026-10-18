# NetGuard — Master Architecture & Operations Specification

## 1. System Identity & Mission
**NetGuard** is a web-based network security management and operations platform designed to provide visibility, triage, and incident response for intrusion detection system (IDS) telemetry.

### Core Architectural Boundary
> **Snort detects. NetGuard manages.**
>
> Snort remains solely responsible for packet capture, protocol decoding, deep packet inspection, rule evaluation, and raw signature alert generation.
> NetGuard is responsible for telemetry ingestion, storage, correlation, actionable alert management, incident orchestration, investigation findings, and operator access control.

---

## 2. Technology Stack

- **Runtime & Language**: Node.js (v22), TypeScript (strict mode)
- **Backend Framework**: Express with TypeScript execution (`tsx`)
- **Database & Storage**: PostgreSQL (Persistent embedded PGlite for self-contained runtime; standard PostgreSQL via `pg.Pool` when `DATABASE_URL` or `SQL_HOST` is supplied)
- **Object-Relational Mapping (ORM)**: Drizzle ORM
- **API Architecture & Validation**: RESTful JSON APIs, Zod schema validation, JWT Bearer authentication, OpenAPI 3.0 / Swagger UI documentation
- **Frontend Framework**: React 19 SPA, Vite middleware, TypeScript
- **Styling & UI Components**: Tailwind CSS, shadcn/ui design patterns, Geist & Geist Mono typography, high-contrast dark neutral palette (`#09090b`)

---

## 3. Version Roadmap

- **V0 — Foundation (Completed)**:
  - User authentication (Bcrypt, JWT) and Role-Based Access Control (`ADMIN`, `ANALYST`, `VIEWER`).
  - Self-healing database initialization and schema indexes.
  - Snort alert telemetry ingestion (`POST /api/events/ingest`) via session or `X-Ingest-Key`.
  - Security events explorer with multi-attribute filtering and raw packet payload inspector.
  - Operator administration console for admins.
  - OpenAPI 3.0 specification and Swagger UI.

- **V1 — Security Operations (Completed)**:
  - **Alert Management**: Separate actionable `alerts` from immutable raw `security_events`.
  - **Incident Management**: Multi-alert grouping, severity classification, and validated status lifecycle.
  - **Investigation Workflow**: Chronological findings, notes, actions taken, and containment records authored by operators.
  - **Ownership & Assignment**: Explicit incident ownership assigned to active analysts/admins.
  - **Basic SOC Dashboard**: Real-time operational queues and incident summaries via REST polling.

- **V2.1 — Analytics Foundations (Completed)**:
  - Metric definitions and authoritative calculation rules.
  - Mean Time to Detect (MTTD) timestamp semantics and latency formulas.
  - Time-series trends (`24h`, `7d`, `30d`) with continuous interval zero-filling.
  - Dedicated REST APIs (`/api/analytics/summary`, `/api/analytics/trends`, `/api/analytics/mttd`, `/api/analytics/health`).
  - Frontend analytics visualizations, time-range controls, and component health.

- **V2.2 — Realtime Integration & Finalization (Completed — Scope Frozen)**:
  - Authenticated WebSocket gateway (`ws`) with JWT handshake.
  - Transaction-safe domain event publication (`alert:*`, `incident:*`, `investigation:*`).
  - Frontend live updating with automatic REST resynchronization and reconnect handling.
  - Administrative audit logging and operational readiness.
  - Master 15-phase end-to-end acceptance suite passed with 100% success. Scope complete and frozen.

---

## 4. Repository Structure

```
├── docs/                               # System documentation & specifications
│   ├── 00-version-scope.md             # Version boundaries & milestones
│   ├── 06-data-model.md                # Unified database schemas & relations
│   ├── 08-alerts-and-incidents.md      # Lifecycles, states & workflows
│   ├── 11-api-design.md                # Complete REST API contracts
│   ├── 15-frontend-v1.md               # Frontend architecture & navigation
│   ├── 16-v2.1-analytics-foundations.md# Analytics, trends & MTTD specifications
│   └── 17-v2.2-realtime-integration-and-finalization.md # WebSockets & live SOC updates
├── src/
│   ├── components/                     # React UI components
│   │   ├── admin/                      # Operator administration views
│   │   ├── auth/                       # Sign-in & registration
│   │   ├── dashboard/                  # SOC dashboard & overview views
│   │   ├── docs/                       # In-app OpenAPI viewer
│   │   ├── events/                     # Telemetry explorer & inspector
│   │   ├── layout/                     # App shell, Navbar & headers
│   │   └── ui/                         # shadcn/ui building blocks
│   ├── context/                        # Client state (AuthContext)
│   ├── db/                             # Drizzle schema, indexes & client
│   │   ├── index.ts                    # Database initialization & pooling
│   │   └── schema.ts                   # Tables & relations
│   ├── server/                         # Express API controllers & services
│   │   ├── auth/                       # Authentication controller & service
│   │   ├── docs/                       # Swagger & OpenAPI router
│   │   ├── events/                     # Telemetry events controller & service
│   │   ├── middleware/                 # Auth & RBAC guard middleware
│   │   └── users/                      # User administration controller & service
│   └── types/                          # Shared TypeScript interfaces
├── server.ts                           # Express server entrypoint & Vite middleware
├── package.json                        # Dependencies & scripts
└── tsconfig.json                       # TypeScript compiler configuration
```
