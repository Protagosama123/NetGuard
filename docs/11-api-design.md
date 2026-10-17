# 11 — Complete REST API Design Specification

## 1. Global Conventions

- **Base URL**: `/api`
- **Request & Response Body**: `application/json`
- **Authentication**: HTTP Bearer JWT token header:
  `Authorization: Bearer <jwt-token>`
- **Sensor Ingestion Key**: Header for automated background shippers:
  `X-Ingest-Key: <ingest-api-key>`
- **Standard Success Format**:
  ```json
  {
    "success": true,
    "data": { ... },
    "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
  }
  ```
- **Standard Error Format**:
  ```json
  {
    "success": false,
    "error": "Descriptive human-readable error message"
  }
  ```

---

## 2. Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new operator (first user becomes `ADMIN`, others `VIEWER`). |
| `POST` | `/api/auth/login` | Public | Authenticate operator with email & password, returns JWT token. |
| `GET` | `/api/auth/me` | Bearer (Any) | Retrieve currently authenticated operator profile. |

---

## 3. User Administration (`/api/users`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Bearer (`ADMIN`) | List all system operators (password hashes excluded). |
| `PATCH` | `/api/users/:id/role` | Bearer (`ADMIN`) | Update user role (`ADMIN`, `ANALYST`, `VIEWER`). Guarded against self-demotion if sole admin. |
| `PATCH` | `/api/users/:id/status` | Bearer (`ADMIN`) | Activate or deactivate user (`isActive: boolean`). Guarded against self-deactivation if sole admin. |

---

## 4. Security Events Telemetry (`/api/events`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/events/ingest` | Bearer (`ADMIN`/`ANALYST`) or `X-Ingest-Key` | Ingest single or batch Snort alert records into `security_events`. |
| `GET` | `/api/events` | Bearer (Any) | Query paginated events with filters: `priority`, `protocol`, `sourceIp`, `destinationIp`, `signatureId`, `search`, `page`, `limit`. |
| `GET` | `/api/events/stats` | Bearer (Any) | High-level telemetry aggregation summary. |
| `GET` | `/api/events/:id` | Bearer (Any) | Retrieve single event detail with packet payload. |

---

## 5. Alert Management Endpoints (`/api/alerts`) — V1 Addition

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/alerts` | Bearer (Any) | List alerts with filters (`status`, `severity`, `sourceIp`, `search`, `page`, `limit`). |
| `GET` | `/api/alerts/stats` | Bearer (Any) | Alert breakdown counts by status and severity. |
| `GET` | `/api/alerts/:id` | Bearer (Any) | Retrieve single alert detail and its linked incident. |
| `POST` | `/api/alerts` | Bearer (`ADMIN`/`ANALYST`) | Manually create an alert or promote a raw security event. |
| `PATCH` | `/api/alerts/:id/status` | Bearer (`ADMIN`/`ANALYST`) | Update alert status (`NEW`, `IN_PROGRESS`, `RESOLVED`, `DISMISSED`). |

---

## 6. Incident Management Endpoints (`/api/incidents`) — V1 Addition

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/incidents` | Bearer (Any) | List incidents with filters (`status`, `severity`, `assignedTo`, `search`, `page`, `limit`). |
| `GET` | `/api/incidents/stats` | Bearer (Any) | Summary metrics: active incidents, unassigned count, severity distribution. |
| `GET` | `/api/incidents/:id` | Bearer (Any) | Retrieve complete incident detail, including linked alerts and timeline. |
| `POST` | `/api/incidents` | Bearer (`ADMIN`/`ANALYST`) | Create a new incident (optional initial `alertIds` array). |
| `PATCH` | `/api/incidents/:id/status`| Bearer (`ADMIN`/`ANALYST`) | Update status (`OPEN`, `INVESTIGATING`, `CONTAINED`, `RESOLVED`, `CLOSED`). |
| `PATCH` | `/api/incidents/:id/assign`| Bearer (`ADMIN`/`ANALYST`) | Assign or unassign operator (`assignedTo: number \| null`). Validates assignee is active `ADMIN` or `ANALYST`. |
| `POST` | `/api/incidents/:id/alerts`| Bearer (`ADMIN`/`ANALYST`) | Link one or more alerts to the incident (`alertIds: number[]`). |
| `DELETE`| `/api/incidents/:id/alerts/:alertId` | Bearer (`ADMIN`/`ANALYST`) | Unlink an alert from the incident. |
| `GET` | `/api/incidents/:id/investigations` | Bearer (Any) | Fetch chronological investigation entries. |
| `POST` | `/api/incidents/:id/investigations` | Bearer (`ADMIN`/`ANALYST`) | Append an investigation entry (`entryType`, `content`). Author set from JWT. |

---

## 7. Documentation Endpoints (`/api/docs`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/docs/openapi.json` | Public | Complete OpenAPI 3.0.3 specification JSON. |
| `GET` | `/api/docs` | Public | Interactive Swagger UI documentation. |
