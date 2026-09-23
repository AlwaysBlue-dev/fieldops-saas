# FieldOps Cloud — Database Design

PostgreSQL is the system of record. Prisma ORM 7 is the only data-access layer. This document proposes the data model. It is **not** an applied migration; the current `api/prisma/schema.prisma` contains no models.

---

## 1. Design rules

1. **UUIDs** for primary keys (`uuid` / `@default(uuid())`).
2. **Every tenant-owned table includes `organizationId`.** Queries always include it.
3. **No organization role on `User`.** Roles live on `OrganizationMembership`.
4. **Soft-deactivate** for referenced entities (`status` or `deactivatedAt`). Hard delete only for purely derived or user-revocable rows (e.g. unused draft, revoked invite).
5. **Timestamps:** `createdAt` / `updatedAt` as `timestamptz`. Business times stored UTC.
6. **Unique business keys are org-scoped** (`@@unique([organizationId, jobNumber])`).
7. **Never store raw tokens.** Store hashes for refresh tokens and invitation tokens.
8. **Never store file bytes in Postgres.** Store `FileObject` metadata.
9. **Audit rows are append-only.** No updates, no deletes in application code.
10. **Prisma 7:** models go in `schema.prisma`; URL stays in `prisma.config.ts`; client generated to `api/generated/prisma`; use `PrismaPg` adapter at runtime.

---

## 2. Enumerations

```
PlatformRole            USER | SUPER_ADMIN

MembershipRole          OWNER | ADMIN | OPERATIONS_MANAGER | SUPERVISOR | TECHNICIAN
MembershipStatus        ACTIVE | DEACTIVATED

OrganizationStatus      ACTIVE | SUSPENDED | DEACTIVATED
InvitationStatus        PENDING | ACCEPTED | REVOKED | EXPIRED

SubscriptionStatus      NONE | TRIALING | ACTIVE | PAST_DUE | CANCELED
PlanCode                STARTER | GROWTH | SCALE   // placeholders; not billed yet

ClientStatus            ACTIVE | DEACTIVATED
SiteStatus              ACTIVE | DEACTIVATED
TeamStatus              ACTIVE | DEACTIVATED
TechnicianStatus        ACTIVE | DEACTIVATED

JobStatus               DRAFT | SCHEDULED | DISPATCHED | IN_PROGRESS
                        | ON_HOLD | AWAITING_APPROVAL | COMPLETED | CANCELED
JobPriority             LOW | NORMAL | HIGH | URGENT
JobAssignmentRole       LEAD | TECHNICIAN

ClockEventType          CLOCK_IN | CLOCK_OUT
ClockEventSource        MOBILE | MANUAL | ADMIN_ADJUSTMENT

FilePurpose             AVATAR | PHOTO | SIGNATURE | DOCUMENT
ApprovalType            TIMESHEET | OVERTIME | JOB_COMPLETION | TIME_ADJUSTMENT
ApprovalStatus          PENDING | APPROVED | RETURNED | REJECTED | CANCELLED
TimesheetStatus         DRAFT | SUBMITTED | APPROVED | REJECTED
NotificationStatus      UNREAD | READ
```

---

## 3. Entity map

```
User ──< OrganizationMembership >── Organization ── OrganizationSettings
  │              │                         │
  │              │                         ├── Invitation
  │              │                         ├── Subscription
  │              │                         ├── Client ──< Site
  │              │                         ├── Team ──< TeamMember
  │              │                         ├── TechnicianProfile
  │              │                         ├── Job ── JobAssignment
  │              │                         │     ├── WorkLog
  │              │                         │     ├── JobMaterial
  │              │                         │     ├── JobPhoto → FileObject
  │              │                         │     └── JobSignature → FileObject
  │              │                         ├── ClockEvent → GpsEvidence
  │              │                         ├── Timesheet ── TimesheetEntry
  │              │                         ├── Approval
  │              │                         ├── Notification
  │              │                         ├── FileObject
  │              │                         ├── AuditEvent
  │              │                         └── OrganizationCounter
  └── RefreshSession
```

Platform-level: `User`, `RefreshSession`. Super-admin actions may write `AuditEvent` with `organizationId` null.

---

## 4. Platform identity

### 4.1 User

Platform person. Not a tenant.

| Column | Notes |
| --- | --- |
| id | UUID PK |
| email | Unique, stored normalized lowercase |
| passwordHash | bcrypt; never selected in public DTOs |
| firstName, lastName | Required after onboarding |
| phone | Optional |
| platformRole | `USER` default; `SUPER_ADMIN` rare |
| emailVerifiedAt | Null until verified |
| deactivatedAt | Soft disable login |
| lastLoginAt | Optional |
| createdAt, updatedAt | UTC |

Indexes: unique `email`; `platformRole` not required.

**Forbidden:** `role` meaning OWNER/TECHNICIAN; `organizationId` on User.

### 4.2 RefreshSession

| Column | Notes |
| --- | --- |
| id | UUID PK |
| userId | FK User |
| tokenHash | Unique; SHA-256 of refresh secret |
| expiresAt | |
| revokedAt | Null if live |
| userAgent, ip | Optional telemetry |
| createdAt | |

Rotate on refresh: revoke old row, insert new. Logout password-change revokes all for user.

---

## 5. Tenancy

### 5.1 Organization

| Column | Notes |
| --- | --- |
| id | UUID PK |
| name | Display |
| slug | Unique globally; URL segment |
| timezone | IANA, required (e.g. `America/New_York`) |
| locale | Default `en-US` |
| status | ACTIVE / SUSPENDED / DEACTIVATED |
| createdByUserId | FK User |
| createdAt, updatedAt | |

### 5.2 OrganizationSettings

1:1 with Organization (`organizationId` PK).

| Column | Notes |
| --- | --- |
| weekStartsOn | 0–6 |
| workdayStart, workdayEnd | Minutes from midnight local, optional |
| overtimeDailyMinutes | e.g. 480 |
| overtimeWeeklyMinutes | e.g. 2400 |
| gpsRequiredOnClock | boolean |
| photoRequiredToComplete | boolean |
| signatureRequiredToComplete | boolean |
| jobNumberPrefix | e.g. `JOB-` |
| updatedAt | |

Keep rules columnar (queryable). Avoid a single opaque JSON blob for enforced rules. Additional JSON `extras` is acceptable for non-enforced UI prefs.

### 5.3 OrganizationMembership

| Column | Notes |
| --- | --- |
| id | UUID PK |
| organizationId | FK |
| userId | FK |
| role | MembershipRole |
| status | ACTIVE / DEACTIVATED |
| createdAt, updatedAt | |

Constraints:

- `@@unique([organizationId, userId])`
- At least one ACTIVE OWNER per ACTIVE organization (enforced in application transactions; optional partial unique later).

This table is the **only** source of org authorization.

### 5.4 Invitation

| Column | Notes |
| --- | --- |
| id | UUID PK |
| organizationId | FK |
| email | Normalized |
| role | MembershipRole (not OWNER via invite unless product later says so; default: Owner is created, not invited) |
| tokenHash | |
| invitedByUserId | FK User |
| status | |
| expiresAt | |
| acceptedAt | |
| acceptedUserId | Optional |
| createdAt | |

Partial uniqueness: one PENDING invite per (`organizationId`, `email`).

### 5.5 Subscription (schema now, billing later)

| Column | Notes |
| --- | --- |
| id | UUID PK |
| organizationId | Unique FK |
| planCode | Placeholder |
| status | NONE / TRIALING / … |
| seatLimit, storageLimitBytes | Nullable until billing |
| currentPeriodStart, currentPeriodEnd | Nullable |
| stripeCustomerId, stripeSubscriptionId | Nullable, unused |
| createdAt, updatedAt | |

No Stripe calls in early phases. Do not block product features on this table beyond creating a `NONE`/`TRIALING` row with the organization.

### 5.6 OrganizationCounter

Used for gap-resistant sequences.

| Column | Notes |
| --- | --- |
| organizationId | PK |
| jobNext | Int, increment in transaction |

---

## 6. Field operations

All tables below include `organizationId` unless noted.

### 6.1 Client

The contractor’s customer (not a FieldOps tenant).

- `name`, optional `accountCode` unique per org, phones/emails, notes, `status`
- `@@unique([organizationId, accountCode])` where code present (application-enforced if optional)

### 6.2 Site

- `clientId` (must belong to same `organizationId`)
- `name`, address lines, locality, region, postalCode, country
- `latitude`, `longitude` nullable
- `accessNotes`, `contactName`, `contactPhone`
- `status`

Always verify `client.organizationId === context.organizationId`.

### 6.3 Team / TeamMember

- Team: `name`, optional `leadMembershipId`, `status`, unique name per org
- TeamMember: `teamId`, `membershipId`, unique pair; both org-scoped

### 6.4 TechnicianProfile

- `membershipId` unique
- `employeeCode` unique per org
- `trades` as text array or separate table later
- `status`

Do not duplicate User name/email here; join through membership.

### 6.5 Job

| Column | Notes |
| --- | --- |
| organizationId | Required |
| jobNumber | Integer sequence; display with prefix in API |
| clientId, siteId | Same-org FKs; site’s client must match |
| title, description | |
| status, priority | Enums |
| scheduledStart, scheduledEnd | timestamptz UTC |
| actualStart, actualEnd | Set from clocks/completion |
| teamId | Optional |
| createdByUserId | |
| completedAt, canceledAt, cancelReason | |
| createdAt, updatedAt | |

`@@unique([organizationId, jobNumber])`
Indexes: `[organizationId, status, scheduledStart]`, `[organizationId, siteId]`

### 6.6 JobAssignment

- `jobId`, `membershipId`, `assignmentRole`
- unique (`jobId`, `membershipId`)
- Denormalize `organizationId` for isolation queries

### 6.7 WorkLog

- `jobId`, `authorMembershipId`, `body`, `loggedAt`
- Append-only by default

### 6.8 Material and JobMaterial

- `Material`: org catalog, `sku` unique per org, `name`, `unit`, `status`
- `JobMaterial`: `jobId`, optional `materialId`, `nameSnapshot`, `quantity`, `unit`, `addedByMembershipId`

Snapshot the name so catalog renames do not rewrite history.

### 6.9 FileObject

| Column | Notes |
| --- | --- |
| organizationId | Null only for platform-level (rare) |
| bucket, objectKey | Unique objectKey |
| mimeType, sizeBytes, originalFileName | |
| checksumSha256 | Optional |
| purpose | Enum |
| uploadedByUserId | |
| createdAt, deletedAt | Soft delete metadata |

### 6.10 JobPhoto / JobSignature

- Photo: `jobId`, `fileId`, optional caption, `takenAt`, optional lat/lng
- Signature: `jobId`, `fileId`, `signerName`, `signedAt`

File purpose must match. Download authorization: membership can access the parent job.

### 6.11 ClockEvent

- `membershipId`, optional `jobId`
- `type`, `source`, `occurredAt` (server UTC), optional `clientOccurredAt`
- optional `gpsEvidenceId`
- `notes` for adjustments
- `adjustedFromEventId` optional self-FK

Invariant: at most one unmatched CLOCK_IN per membership (partial unique or transactional check).

### 6.12 GpsEvidence

- `membershipId`, optional `jobId`, `clockEventId`
- `latitude`, `longitude`, `accuracyMeters`
- `capturedAt`

P1 stores event points, not a breadcrumb stream.

### 6.13 Timesheet / TimesheetEntry

- Timesheet: `membershipId`, `periodStart`, `periodEnd` (UTC instants of local org dates), `status`, totals, submit/approve metadata
- unique (`membershipId`, `periodStart`)
- Entry: optional `clockEventId`, optional `jobId`, `minutes`, `overtimeMinutes`, `source`

Approver FKs point at users/memberships in the same org.

### 6.14 Approval

Polymorphic but explicit:

- `type`, `status`
- `subjectType`, `subjectId` (timesheet id, job id, overtime id)
- `requestedByUserId`, `requestedAt`
- `assignedApproverUserId`, `assignedRole`
- `decidedByUserId`, `decidedAt`, `decision`, `comment`
- unique `(organizationId, type, subjectId)` so retries do not duplicate inbox rows

Index `[organizationId, status, type]` for the action center.

### 6.15 Notification

- `userId` (recipient), `organizationId` (nullable for platform)
- `type`, `title`, `body`, `payloadJson`
- `readAt`

### 6.16 AuditEvent

| Column | Notes |
| --- | --- |
| organizationId | Null for platform |
| actorUserId | Null for system |
| action | e.g. `job.completed` |
| entityType, entityId | |
| metadataJson | Redacted |
| ip, userAgent | Optional |
| createdAt | |

No `updatedAt`. Indexes: `[organizationId, createdAt]`, `[entityType, entityId]`.

---

## 7. Referential integrity notes

- Prefer `onDelete: Restrict` for tenant entities so history cannot vanish via cascade.
- Invitations and notifications may `onDelete: Cascade` from Organization if the org is hard-deleted (rare; prefer org status = DEACTIVATED).
- Same-organization consistency (site.clientId belongs to same org) is **not** expressible as a single Postgres FK across two columns without composite FKs. Enforce in services and add composite FKs where Prisma allows:

```
clientId + organizationId  →  Client.id + Client.organizationId
```

Use composite foreign keys for Job→Client, Job→Site, Site→Client, Assignment→Membership, etc. This is a primary isolation hardening technique.

---

## 8. Proposed Prisma sketch (documentation only)

This is illustrative of naming and relations. Do not paste blindly without indexes, composite FKs, and Prisma 7 generator config.

```prisma
enum PlatformRole {
  USER
  SUPER_ADMIN
}

enum MembershipRole {
  OWNER
  ADMIN
  OPERATIONS_MANAGER
  SUPERVISOR
  TECHNICIAN
}

enum MembershipStatus {
  ACTIVE
  DEACTIVATED
}

model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String
  firstName       String
  lastName        String
  phone           String?
  platformRole    PlatformRole @default(USER)
  emailVerifiedAt DateTime?
  deactivatedAt   DateTime?
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  memberships     OrganizationMembership[]
  refreshSessions RefreshSession[]
}

model RefreshSession {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  userAgent String?
  ip        String?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id])

  @@index([userId])
}

model Organization {
  id              String    @id @default(uuid())
  name            String
  slug            String    @unique
  timezone        String
  locale          String    @default("en-US")
  status          String    // use enum in real schema
  createdByUserId String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  memberships     OrganizationMembership[]
  settings        OrganizationSettings?
  subscription    Subscription?
}

model OrganizationMembership {
  id             String           @id @default(uuid())
  organizationId String
  userId         String
  role           MembershipRole
  status         MembershipStatus @default(ACTIVE)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  organization   Organization     @relation(fields: [organizationId], references: [id])
  user           User             @relation(fields: [userId], references: [id])

  @@unique([organizationId, userId])
  @@index([userId, status])
}

model OrganizationSettings {
  organizationId              String  @id
  weekStartsOn                Int     @default(1)
  overtimeDailyMinutes        Int     @default(480)
  overtimeWeeklyMinutes       Int     @default(2400)
  gpsRequiredOnClock          Boolean @default(false)
  photoRequiredToComplete     Boolean @default(false)
  signatureRequiredToComplete Boolean @default(false)
  jobNumberPrefix             String  @default("JOB-")
  updatedAt                   DateTime @updatedAt
  organization                Organization @relation(fields: [organizationId], references: [id])
}
```

Remaining models follow the same pattern: UUID, `organizationId`, composite uniques, composite FKs, indexes listed in section 6.

---

## 9. Query conventions

```
# Correct
prisma.job.findFirst({ where: { id: jobId, organizationId } })

# Incorrect — cross-tenant IDOR risk
prisma.job.findUnique({ where: { id: jobId } })
```

List endpoints always `where: { organizationId }` **and** extra scope (assigned membership, team ids) for technicians/supervisors.

Because Prisma 7 has no middleware, provide a small `TenantPrisma` helper or repository base that requires `organizationId` in the type system (e.g. function argument `ctx: RequestContext`). Do not wrap the whole client in a magic proxy unless it is thoroughly tested.

---

## 10. Migrations and environments

- Dev: `prisma migrate dev` against local Docker Postgres.
- Prod: `prisma migrate deploy`.
- Never `db push` as the production workflow.
- Seeds: optional development users only, behind an explicit seed command. No “demo jobs” hardcoded in React components.
- Generated client output `api/generated/prisma` is gitignored; CI must run `prisma generate`.

---

## 11. What is not in v1 schema

- Stripe invoice tables (reserved columns on Subscription are enough)
- GPS breadcrumb streams
- Chat/messages
- Inventory warehouses / purchase orders
- Multi-currency ledgers
- Row Level Security policies (evaluate after application isolation is proven; RLS is a hardening layer, not a substitute)

RLS can be a later defense-in-depth using `SET LOCAL app.organization_id` per transaction. It is not required to start, and must not be the only isolation mechanism.
