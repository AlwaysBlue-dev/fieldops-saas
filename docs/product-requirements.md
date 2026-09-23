# FieldOps Cloud — Product Requirements

**Product:** FieldOps Cloud
**Type:** Independent commercial multi-tenant SaaS
**Status:** Foundation / pre-implementation
**Audience:** Electrical, HVAC, plumbing, fire/security, maintenance, and facilities contractors

This document defines what FieldOps Cloud is, who it is for, and which capabilities the platform must support. It is not a clone of any existing client application. Implementation of business modules is out of scope for the current documentation phase.

---

## 1. Product vision

FieldOps Cloud is an operations-command-center for field-service companies. Dispatchers, supervisors, and owners run the day from a dense desktop workspace. Technicians run the day from a phone-first shell that feels like a native field app.

The product must feel premium, confident, and operational — not like a generic admin template and not like a consumer dashboard.

Core promise:

> One organization workspace where office staff can plan, dispatch, and approve work, and field technicians can see their day, capture evidence, and get paid for the hours they actually worked.

---

## 2. What this product is not

- Not a single-tenant custom app for one contractor.
- Not a white-label of a previous client project.
- Not a generic CRM, ERP, or project-management tool.
- Not a consumer marketplace that matches random technicians to jobs.
- Not a self-serve checkout product. Commercial offer is FieldOps Cloud Professional at $499/year (14-day trial, 3-day grace, 10 users, 20 GB). Business pricing is by contact.

---

## 3. Personas

### 3.1 Owner

Runs the company. Cares about crew utilization, overtime cost, customer reputation, and whether work is actually getting done. Needs a trustworthy dashboard, approvals, and reporting without living in spreadsheets.

### 3.2 Administrator

Sets up the organization: users, roles, clients, sites, materials catalog, and settings. Invites staff and deactivates people who leave.

### 3.3 Operations manager

Owns the board: jobs, schedule, dispatch, exceptions, and the action center. Needs density, keyboard speed, and a live sense of who is where.

### 3.4 Supervisor

Owns a crew. Reviews My Day exceptions, timesheets, overtime, incomplete job cards, missing photos/signatures, and team performance.

### 3.5 Technician

Works from a phone, often outdoors, often with dirty gloves and bad signal. Needs: today’s jobs, navigation to the site, clock in/out, GPS evidence, photos, materials, notes, and a client signature — with large targets and sticky primary actions.

### 3.6 Platform super admin (internal)

FieldOps Cloud operator. Manages platform health, organization suspension, and support break-glass access. Does **not** casually browse tenant job photos or customer data.

---

## 4. Tenancy and identity (non-negotiable)

FieldOps Cloud is multi-tenant from day one.

| Concept | Rule |
| --- | --- |
| User | Platform identity. Email + credentials. May belong to many organizations. |
| Organization | Tenant. The commercial customer of FieldOps Cloud. |
| Membership | Join table of User ↔ Organization with an organization-specific role. |
| Invitation | Time-limited offer to join one organization with a proposed role. |
| Subscription/plan | Organization-scoped commercial entitlement. Schema now, charging later. |
| Settings | Organization-specific. Timezone, workweek, evidence rules, numbering. |
| Isolation | Tenant-owned records are never readable or writable across organizations. |

**Platform roles** live on the User:

- `USER`
- `SUPER_ADMIN`

**Organization roles** live only on membership:

- `OWNER`
- `ADMIN`
- `OPERATIONS_MANAGER`
- `SUPERVISOR`
- `TECHNICIAN`

Never store organization role on `User`. A person can be `OWNER` of one company and `TECHNICIAN` in another.

Frontend-submitted organization IDs are selection information only. Backend membership verification is the only authority.

---

## 5. Primary user journeys

### 5.1 Start a company workspace

1. A person registers a User account.
2. They create an Organization and become its `OWNER`.
3. They set timezone and basic operating rules.
4. They invite office staff and technicians.
5. Invitees accept, set a password if needed, and land in that organization.

### 5.2 Office runs the day

1. Operations opens the dashboard: work queue, crew status, approvals.
2. They create or review clients and sites.
3. They create job cards, assign technicians or teams, and place work on the schedule.
4. They watch clock-ins, GPS evidence, and incomplete cards.
5. They process timesheets, overtime, and other approvals.
6. They use reports for the week/month.

### 5.3 Technician runs the day

1. Technician opens Home / My Day.
2. Sees ordered jobs, travel, and required actions.
3. Clocks in (GPS captured according to org settings).
4. Opens a job card, navigates to the site, logs work, materials, and photos.
5. Captures client signature.
6. Clocks out. Hours flow into the timesheet.

### 5.4 Multi-organization user

1. A consultant or contractor belongs to two organizations.
2. After login they pick an organization (or resume the last verified one).
3. Switching organization reloads the workspace. No data from org A appears in org B.

---

## 6. Functional requirements

Requirements are grouped by domain. Priority: **P0** foundation, **P1** first commercial slice, **P2** operational completeness, **P3** later expansion. Billing is **P3 / deferred**.

### 6.1 Authentication and session — P0

- Email/password registration and login.
- Email verification.
- Password reset via transactional email.
- Session via secure HTTP-only cookies (access + refresh).
- Logout revokes refresh tokens.
- Authenticated session endpoint returns user, memberships, and current organization.
- No JWT/access tokens in `localStorage` or `sessionStorage`.
- No business records in browser storage except ephemeral UI state (sidebar collapsed, theme).

### 6.2 Organizations, memberships, invitations — P0

- Create organization (creator becomes `OWNER`).
- Update organization profile and timezone.
- List memberships; change roles; deactivate members.
- Invite by email with a role; resend; revoke.
- Accept invitation (existing user or new user).
- Prevent last `OWNER` from leaving or being deactivated without transfer.
- User can list organizations they belong to and switch the active organization.
- Soft-deactivate memberships rather than hard-delete history.

### 6.3 Organization settings — P1

- IANA timezone (source of business-day calculations).
- Week start, working hours, overtime thresholds (structured, not free-text only).
- Evidence rules: GPS on clock events, photos required to complete, signature required to complete.
- Job number prefix and next sequence.
- Locale / date-time display preferences.
- Future: branding, notification channels. Do not block P1 on branding.

### 6.4 Dashboard — P1

Desktop command center, not a vanity analytics page:

- Work queue (today/overdue/unassigned).
- Crew/activity status (clocked in, on site, idle, offline).
- Approvals/action center.
- Restrained operational metrics (jobs completed, hours, exceptions).
- Keyboard-first command palette to jump to jobs, clients, people.

Mobile Home is a technician-oriented My Day, not a miniature of the desktop dashboard.

### 6.5 Clients — P1

- Organization-owned customers (the contractor’s clients, not FieldOps Cloud tenants).
- Name, account code, contacts, phone, email, notes, status.
- Soft-deactivate when referenced by sites or jobs.
- Search and filter inside the organization only.

### 6.6 Sites — P1

- Belong to a client inside an organization.
- Address, geo coordinates, access notes, on-site contact.
- A client may have many sites.
- Jobs are typically performed at a site.

### 6.7 Teams and technicians — P1

- Teams group memberships for dispatch (e.g. “HVAC North”).
- Technician profile: employee code, trades/skills, status, home team.
- A technician is a User with an active membership; technician-specific fields live on a profile, not on User.
- Supervisors can be associated with teams they lead.

### 6.8 Job cards — P1 / P2

The job card is the system of record for a unit of field work.

- Org-scoped job number.
- Client, site, description, priority, status, scheduled window.
- Assignments to technicians and/or a team.
- Status workflow enforced by the API, not by the UI alone.
- Work logs, materials used, photos, signatures, clock events, GPS evidence attach to the job.
- Completion rules respect organization settings (photos/signature/GPS).
- Soft-cancel rather than destroying history.

Proposed status set (API-authoritative):

`DRAFT → SCHEDULED → DISPATCHED → IN_PROGRESS → ON_HOLD | AWAITING_APPROVAL → COMPLETED`

Also: `CANCELED` from non-terminal states with reason.

Exact transitions are implemented later; the API must reject illegal jumps.

### 6.9 Schedule — P1 / P2

- Desktop schedule for a day/week: technicians vs time, jobs as blocks.
- Mobile Schedule: the technician’s upcoming window.
- Unassigned / overflow work queue.
- Conflict awareness (double-booking) is a P2 warning, not a hard blocker in P1 unless easily done safely.

### 6.10 Technician My Day — P1

- Ordered list of today’s assigned jobs in the organization timezone.
- Primary actions: navigate, clock, open card, call site contact.
- Outstanding requirements (missing photo, unsigned, still clocked in).
- Offline-tolerant capture is **P3**; P1 may assume connectivity and must fail clearly when offline.

### 6.11 Clock in / out — P1

- Technician clock in/out against the day and optionally against a job.
- Server timestamp in UTC is authoritative; client-reported time is evidence, not truth.
- Manual adjustments by permitted office roles are audited.
- Clock events feed timesheets.

### 6.12 GPS evidence — P1 / P2

- Optional/required per organization settings.
- Capture lat, lng, accuracy, timestamp, source.
- Stored as structured evidence linked to clock events and/or jobs.
- Not a live tracking product in P1 (no continuous breadcrumb streaming).

### 6.13 Work logs — P1

- Timestamped notes on a job.
- Author is the authenticated membership user.
- Immutable body after create, or append-only edits with audit (decide at implementation; default append-only).

### 6.14 Materials — P2

- Organization material catalog (sku, name, unit).
- Job usage lines (catalog item or ad-hoc description, quantity).
- Soft-deactivate catalog items.

### 6.15 Photos — P1

- Camera-first upload on mobile.
- Type/size validation.
- Object bytes in object storage; metadata in PostgreSQL.
- Linked to job (and optionally GPS).
- Cannot be fetched across tenants even with a guessed object key.

### 6.16 Client signatures — P1 / P2

- Touch-friendly capture on mobile.
- Stored as an image object plus signer name and signed-at UTC.
- Required-to-complete when settings say so.

### 6.17 Timesheets — P2

- Periods calculated in the organization timezone.
- Built from clock events, with permitted adjustments.
- Submit → approve/reject workflow.
- Technician sees own; supervisor/office sees permitted scope.

### 6.18 Overtime — P2

- Derived from timesheet hours vs organization overtime rules.
- Flagged for approval when thresholds exceeded.
- Visible on timesheet and in the action center.

### 6.19 Approvals — P2

A single action center covering at least:

- Timesheet submission
- Overtime exception
- Job completion (if settings require office sign-off)
- Manual time adjustment

API enforces who may decide. UI never “approves” locally.

### 6.20 Notifications — P2

- In-app notifications for assignments, invitations, approvals, and schedule changes.
- Email for invitations, password reset, and (later) digest alerts.
- No SMS in P1/P2.

### 6.21 Reporting — P2 / P3

- Operational reports: jobs completed, hours, overtime, unassigned work, missing evidence.
- Scoped strictly to the organization and the viewer’s role.
- Export (CSV) is P3.

### 6.22 Audit history — P0 (infrastructure) / P1 (coverage)

- Important mutations write an audit row in the same transaction when practical.
- Actor, organization, action, entity type/id, metadata without secrets.
- Owners/admins can inspect; technicians cannot browse the full audit log.

### 6.23 Platform administration — P2

- Super admin: list organizations, suspend/reinstate, inspect platform health.
- Break-glass tenant access, if ever added, must be explicit, time-boxed, and audited. Default is **no** tenant data access.

### 6.24 Subscriptions — designed, not billed

- Organization has a subscription record (trial/active/none).
- Plan limits (seats, storage) may be stored.
- Stripe fields reserved.
- Enforcement and Stripe Checkout are **out of scope** until a later phase.

---

## 7. Role capabilities (organization)

This is the product-level matrix. The API is the enforcement point.

| Capability | Owner | Admin | Operations manager | Supervisor | Technician |
| --- | --- | --- | --- | --- | --- |
| Org profile & settings | Full | Full | Limited (ops rules) | No | No |
| Future billing | Full | No | No | No | No |
| Invite / change roles | Full | Full (not Owner) | Invite technicians | No | No |
| Deactivate members | Full | Full (not Owner) | No | No | No |
| Clients & sites | Full | Full | Full | Team-scoped edit; broader view TBD | View on assigned jobs |
| Teams | Full | Full | Full | Lead own team | View own team |
| Jobs — create/dispatch | Yes | Yes | Yes | Yes (team) | No |
| Jobs — view | All | All | All | Team + assigned | Assigned only |
| Schedule | All | All | All | Team | Own |
| Clock / GPS | Adjust others (audited) | Adjust others | Adjust others | Team | Self |
| Job evidence (logs, photos, materials, signature) | All | All | All | Team | Assigned jobs |
| Timesheets | All | All | All | Team | Own |
| Approvals | Yes | Yes | Yes | Team timesheets/overtime | Request only |
| Reports | All | All | All | Team | Own time |
| Audit log | Yes | Yes | Limited | No | No |

“Team-scoped” means records associated with teams the supervisor leads, plus jobs assigned to those technicians. Ambiguities are resolved in the API in favor of **less** data, not more.

---

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Tenancy | Proven isolation; automated tests that a member of org A cannot read org B. |
| Authority | NestJS API owns permissions and workflow. Next.js never trusts itself for authorization. |
| Time | Persist UTC. Display and business days use organization timezone. |
| Durability | PostgreSQL is source of truth. Object storage holds bytes only. |
| Uploads | MIME allow-list, size cap, authenticated upload, tenant-prefixed object keys. |
| Availability | Design for a single Nest API + Next web + managed Postgres + S3. No extra moving parts yet. |
| Accessibility | Keyboard operable, visible focus, labels, contrast, skip/target sizes on mobile. |
| Responsive | 320px through large desktop. Desktop rail + mobile bottom nav, not one layout squeezed. |
| Performance | Dense desktop lists must virtualize or paginate; mobile My Day must feel instant on assigned jobs. |
| Observability | Structured logs with request id, user id, organization id. No secrets in logs. |
| Compliance posture | Audit trail, least privilege, soft-deactivate, no password hashes/tokens in responses. |

---

## 9. Out of scope (now)

- Stripe charging, invoices, customer portal.
- Redis, queues, Kubernetes, microservices.
- Real-time live GPS tracking and playback.
- Offline-first sync engine.
- Native iOS/Android stores (responsive web first; PWA later).
- Public client/customer portal for the contractor’s end customers.
- Accounting/GL, payroll file formats, inventory purchasing.
- Copying UX, information architecture, or code from any previous client app.

---

## 10. Success criteria for the first commercial slice

A contractor can:

1. Create an organization and invite a mixed office/field crew.
2. Record clients and sites.
3. Dispatch job cards onto a schedule.
4. Have technicians complete My Day with clock, photos, and signature.
5. Approve timesheets without leaving the product.
6. Trust that another contractor on the same platform cannot see any of it.

Until those six are true, new adjacent features are lower priority than finishing this slice correctly.
