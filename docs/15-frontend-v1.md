# 15 — Frontend Architecture & V1 User Experience

## 1. Design Constitution & Guidelines

NetGuard follows a clean, professional cybersecurity Operations Center aesthetic:
- **Typography**: Geist Sans for interface elements; Geist Mono for telemetry, IPs, timestamps, ports, and SIDs.
- **Palette**: Dark neutral zinc palette (`#09090b` background, `#18181b` cards, `#27272a` borders) with high-contrast, semantic severity indicators.
- **Severity Color Semantics**:
  - `CRITICAL` / `SEV1`: Crimson red (`text-red-400`, `bg-red-950/60`, `border-red-800/60`)
  - `HIGH` / `SEV2`: Amber / orange (`text-orange-400`, `bg-orange-950/60`, `border-orange-800/60`)
  - `MEDIUM` / `SEV3`: Yellow (`text-amber-300`, `bg-amber-950/60`, `border-amber-800/60`)
  - `LOW` / `SEV4`: Cyan / blue (`text-sky-400`, `bg-sky-950/60`, `border-sky-800/60`)
  - `INFO`: Neutral zinc (`text-zinc-400`, `bg-zinc-800`)

---

## 2. Navigation Architecture (`src/components/layout/Navbar.tsx`)

The top navigation header maintains instant access to all primary functional views:

```
[NetGuard V0/V1] | [Dashboard] [Alerts] [Incidents] [Telemetry Events] [Admin*] [API Docs] | [Live Ping] [Role Badge] [Logout]
```
*\*Admin tab is strictly visible only to users with the `ADMIN` role.*

---

## 3. View Specifications

### 3.1 Basic SOC Dashboard (`SocDashboardView.tsx`)
- High-level operational KPI cards:
  - **Active Incidents**: Count of non-closed incidents.
  - **Unassigned Incidents**: Critical queue needing immediate assignment.
  - **Open Alerts**: Breakdown by severity (Critical, High, Medium, Low).
  - **Raw Telemetry Rate**: Ingested events over the last 24 hours.
- **Urgent Triage Queue**: Quick table of highest priority unassigned alerts and active SEV1/SEV2 incidents.
- Quick navigation shortcuts to create incidents or review alerts.

### 3.2 Alert Management View (`AlertsView.tsx`)
- **Triage Table**: List of actionable alerts with filters (status, severity, search, IP).
- **Status Transition Actions**: One-click actions to acknowledge (`IN_PROGRESS`), resolve, or dismiss.
- **Escalate to Incident**: Direct action button to group one or more selected alerts into a new or existing incident.
- **Source Telemetry Link**: Button opening the underlying raw Snort security event details.

### 3.3 Incident Operations View (`IncidentsView.tsx` & `IncidentDetailModal.tsx`)
- **Incident Explorer**: Filterable table of incidents with severity chips, status badges, and assignee avatars.
- **Create Incident Modal**: Form specifying title, description, initial severity, assignee, and optional attached alerts.
- **Incident Inspector**:
  - Header: Severity, status, assignee, timestamps.
  - Linked Alerts section: Table of associated alerts with "Link Alert" and "Unlink" controls.
  - Investigation Timeline: Chronological entries with category tags (`NOTE`, `ACTION_TAKEN`, `CONTAINMENT`, `EVIDENCE`). Form to append new entries.
  - Resolution Section: Status selector and mandatory resolution summary text box upon closure.

### 3.4 Raw Telemetry Explorer (`SecurityEventsView.tsx` — V0)
- Preserved without regression. Full Snort packet stream, signature filter, IP vector search, and packet payload inspector.

### 3.5 Operator Administration (`UserAdminView.tsx` — V0)
- Preserved without regression. Accessible only to `ADMIN`. Role modifier, account deactivation, and operator onboarding.

---

## 4. Role-Based UI Discipline
- **`ADMIN`**: Full read/write access across all views, controls, assignments, and user management.
- **`ANALYST`**: Full operational access across telemetry, alerts, incidents, investigations, and assignments. User administration tab is hidden and blocked.
- **`VIEWER`**: Read-only observation access. Ingestion, status modification, assignment, and incident creation buttons are hidden or disabled.
