# FieldOps Cloud — Database Implementation

This records what was implemented for Prisma schema, NestJS database integration, tenancy foundation, and development seed. It is not a billing or frontend delivery.

Prisma ORM **7.10.0** with PostgreSQL 17 and the `PrismaPg` driver adapter.

---

## Commands run

Working directory: `api/`. Node **24.14.1** via `fnm` (Prisma 7 requires Node 20.19+; the Windows default on this machine was Node 18).

| Step | Result |
| --- | --- |
| `npx prisma validate` | Schema valid |
| `npx prisma format` | Schema formatted |
| `npx prisma migrate dev --name init_tenancy_foundation` | Applied `20260923100154_init_tenancy_foundation` |
| `npx prisma migrate deploy` | Applied `20260923101000_clock_and_invite_guards` |
| `npx prisma generate` | Client generated to `api/src/generated/prisma` |
| `npx prisma db seed` | Two orgs, plans, crews, jobs seeded |
| `npm run build` | Nest build succeeded |
| `npm test` | 7 passed (health + tenant isolation) |
| `npm run test:e2e` | 2 passed (`GET /api/health`, `GET /api/health/database`) |

---

## Models created

### Platform

| Model | Purpose |
| --- | --- |
| `User` | Global identity. `platformRole` is `USER` or `SUPER_ADMIN` only. `fullName`, `status` ACTIVE/INACTIVE. No organization role. |
| `RefreshSession` | Hashed refresh token, expiry, revoke, device metadata (`userAgent`, `ipAddress`, `deviceName`). |

### Tenancy

| Model | Purpose |
| --- | --- |
| `Organization` | Tenant. Unique `slug`. |
| `OrganizationMember` | User ↔ org with `OrganizationRole`. Unique `(organizationId, userId)`. |
| `OrganizationInvitation` | Invite by email + role. `tokenHash` unique. |
| `OrganizationSettings` | 1:1 org operating rules (signature/GPS/manual time/risk/hours). |
| `OrganizationCounter` | Per-org `jobNext` sequence for concurrent job numbering. |

### SaaS (no payment provider)

| Model | Purpose |
| --- | --- |
| `Plan` | Catalog: unique `code`, prices in cents, seat/storage limits, `features` JSON. |
| `Subscription` | 1:1 org. `externalCustomerId` / `externalSubscriptionId` reserved. Not wired to Stripe. |

### Field operations

| Model | Purpose |
| --- | --- |
| `Team` | Org-scoped crew. Unique name per org. |
| `TeamMember` | Team ↔ user, org-scoped. Unique `(teamId, userId)`. |
| `Client` | Contractor customer. Optional `accountCode` unique per org. |
| `Site` | Client location. Composite FK to `Client` `(id, organizationId)`. |
| `SiteContact` | Site people. Composite FK to `Site`. |
| `Job` | Work card. Human `jobNumber` unique per org. Composite FKs to client, site, optional team. |
| `JobAssignment` | Technician on a job. Unique `(jobId, userId)`. |
| `JobSafetyControl` | Risk/safety items on a job. |
| `JobWorkLog` | Append-style notes. |
| `JobMaterial` | Usage lines (no catalog table in this slice). |
| `JobFile` | Object metadata only. Unique `objectKey`. |
| `JobSignature` | Signature metadata + object key (image bytes stay in object storage). |
| `ClockSession` | Clock in/out + optional GPS. Partial unique: one `OPEN` per technician. |
| `TimeEntry` | Clock-derived or manual time. |
| `OvertimeAuthorization` | Overtime request/decision. |
| `Approval` | Generic action-center row (`subjectType` + `subjectId`). |
| `Notification` | In-app notice. `organizationId` nullable for platform. |
| `AuditLog` | Append-only. `organizationId` and `actorUserId` nullable. `createdAt` is the timestamp. |

Tenant-owned operational tables include explicit `organizationId`. Composite foreign keys prevent a child row from pointing at another tenant’s parent (e.g. a site cannot attach to another org’s client).

---

## Migrations

| Migration | What it does |
| --- | --- |
| `prisma/migrations/20260923100154_init_tenancy_foundation` | Enums, tables, FKs, standard unique/secondary indexes |
| `prisma/migrations/20260923101000_clock_and_invite_guards` | Partial unique indexes that Prisma schema cannot express |

Do not drop these extra indexes in a later `migrate dev` diff:

- `ClockSession_one_open_per_technician_idx`
- `OrganizationInvitation_one_pending_email_per_org_idx`

Client output: `api/src/generated/prisma` (gitignored). CI and local setup must run `npx prisma generate`.

Config: `api/prisma.config.ts` (Prisma 7). Seed command: `tsx prisma/seed.ts`.

---

## Indexes

Besides primary keys:

**Unique**

- `User.email`
- `RefreshSession.tokenHash`
- `Organization.slug`
- `OrganizationMember (organizationId, userId)`
- `OrganizationInvitation.tokenHash`
- `Plan.code`
- `Subscription.organizationId`
- `Team (id, organizationId)`, `Team (organizationId, name)`
- `TeamMember (teamId, userId)`
- `Client (id, organizationId)`, `Client (organizationId, accountCode)`
- `Site (id, organizationId)`
- `Job (id, organizationId)`, `Job (organizationId, jobNumber)`
- `JobAssignment (jobId, userId)`
- `JobFile.objectKey`, `JobSignature.objectKey`
- `ClockSession (id, organizationId)`
- Partial: one `OPEN` clock session per `technicianUserId`
- Partial: one `PENDING` invitation per `(organizationId, email)`

**Secondary (query)**

- Membership: `(userId, status)`, `(organizationId, role, status)`
- Job board: `(organizationId, status, scheduledStart)`, client/site/team/supervisor/priority
- Clock: `(organizationId, technicianUserId, status)`, `(organizationId, jobId)`
- Time/overtime/approvals/notifications/audit as listed in the init migration

`(id, organizationId)` unique constraints exist so composite FKs can target tenant-safe parent rows.

---

## Health URLs

Global prefix `api`. Default listen port **4000**.

| Method | Path | Meaning |
| --- | --- | --- |
| GET | `http://localhost:4000/api/health` | Process up |
| GET | `http://localhost:4000/api/health/database` | `SELECT 1` against PostgreSQL; 503 if down |

---

## Seed credentials

Shared development password from `SEED_PASSWORD` (default and current local value: `FieldOps.Dev!2026`). Documented in `api/.env.example`. **Local only. Not for production.**

All seed users have verified email and `platformRole = USER`.

### Northstar Electrical (`northstar-electrical`)

Timezone `America/Chicago`. Plan: Professional (trial). Job prefix `NS-`.

| Role | Name | Email |
| --- | --- | --- |
| OWNER | Jordan Hale | `jordan.hale@northstar.fieldops.local` |
| ADMIN | Avery Quinn | `avery.quinn@northstar.fieldops.local` |
| OPERATIONS_MANAGER | Morgan Ellis | `morgan.ellis@northstar.fieldops.local` |
| SUPERVISOR | Riley Chen | `riley.chen@northstar.fieldops.local` |
| TECHNICIAN | Sam Ortega | `sam.ortega@northstar.fieldops.local` |
| TECHNICIAN | Casey Nguyen | `casey.nguyen@northstar.fieldops.local` |

Jobs: `NS-1001` Harborview Clinic panel upgrade (`IN_PROGRESS`, Sam clocked in), `NS-1002` Maple Street Bakery kitchen circuit (`SCHEDULED`).

### BluePeak HVAC (`bluepeak-hvac`)

Timezone `America/Denver`. Plan: Starter (trial). Job prefix `BP-`.

| Role | Name | Email |
| --- | --- | --- |
| OWNER | Dana Brooks | `dana.brooks@bluepeak.fieldops.local` |
| ADMIN | Lee Park | `lee.park@bluepeak.fieldops.local` |
| OPERATIONS_MANAGER | Chris Vadim | `chris.vadim@bluepeak.fieldops.local` |
| SUPERVISOR | Nina Solis | `nina.solis@bluepeak.fieldops.local` |
| TECHNICIAN | Owen Drake | `owen.drake@bluepeak.fieldops.local` |
| TECHNICIAN | Ivy March | `ivy.march@bluepeak.fieldops.local` |

Jobs: `BP-1001` Summit Lodge RTU service (`SCHEDULED`), `BP-1002` Pine Ridge School chiller inspection (`DISPATCHED`). Ivy has a **closed** clock session (so Northstar’s open session cannot collide globally).

Re-run: `npx prisma db seed` (upserts by slug/email/job number).

---

## Test organizations

Vitest fixtures in `src/tenancy/tenancy.isolation.spec.ts` create **separate** orgs (`tenant-a-*` / `tenant-b-*`) and assert:

1. Listing jobs with `withTenant(organizationId)` never returns the other tenant’s rows.
2. `findFirst({ id: otherJobId, organizationId: thisOrg })` is null.
3. Creating a site with org A’s `organizationId` and org B’s `clientId` is rejected by the composite FK.
4. A second `OPEN` `ClockSession` for the same technician is rejected.
5. The same `jobNumber` can exist in both orgs.

Seed data is additionally available for manual cross-tenant checks (Harborview vs Summit Lodge).

---

## NestJS integration

- `PrismaModule` (global) + `PrismaService` extending generated `PrismaClient` with `PrismaPg` adapter
- `createPrismaClient()` shared by seed and isolation tests
- `withTenant(organizationId, where)` helper — organization id must come from verified membership, not the client body
- `HealthController` under `/api/health`

No auth cookies, no business HTTP APIs, no Stripe, no frontend screens in this slice.

---

## Assumptions

1. **Prisma 7 stays.** Generator is `prisma-client` with explicit `output` and ESM. URL lives in `prisma.config.ts`, not `schema.prisma`.
2. **Membership model name** is `OrganizationMember` as specified for this implementation (docs previously used `OrganizationMembership`).
3. **User** uses `fullName` and `status`, not split first/last or `deactivatedAt`.
4. **Job statuses** use `PENDING_APPROVAL`, `RETURNED`, and `CANCELLED` (two L’s) as specified.
5. **`OrganizationCounter`** was added so job numbers can be allocated in a transaction later. Not a product UI model.
6. **Binary files** are never in Postgres. `JobFile` / `JobSignature` store keys. Intended key prefix: `organizations/{organizationId}/jobs/{jobId}/...`. Seed writes metadata only; MinIO objects are not uploaded.
7. **One open clock session per technician is global** (partial unique on `technicianUserId`), not per organization. A person cannot be clocked into two tenants at once.
8. **Invitation `tokenHash` in seed** is a stable placeholder (`seed-invite-{slug}`), not a production-grade hash. Real invites must store a hash of a random token.
9. **Composite FKs** are the database isolation layer for parent/child tenant alignment. Application code must still filter by `organizationId` from membership context.
10. **Node 20.19+** is required to run Prisma CLI and this API toolchain. Use `fnm use 24.14.1` (or equivalent) if the system Node is 18.
11. **No RLS yet.** Isolation is schema + queries + tests.
12. **Prices on `Plan`** are placeholders. No Stripe calls, webhooks, or customer portal.
