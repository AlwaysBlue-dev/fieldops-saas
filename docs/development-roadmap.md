# FieldOps Cloud — Development Roadmap

Do not implement business modules in this documentation phase. This roadmap is the agreed order of work after the documents land.

---

## 0. Guiding order

Build **trustworthy tenancy and identity** before jobs. Build **shells and tokens** before dense dashboards. Build **job cards + My Day** before reporting polish. **Do not bill** until the operational slice is real.

Every phase must leave the tree independently runnable (web + api + docker infra).

---

## Phase 0 — Platform bootstrap (no business features)

Fix the scaffold so Prisma 7, Nest, and Next can actually carry the product.

### 0.1 API bootstrap

- Add `prisma` CLI, `dotenv`, and npm scripts (`prisma:generate`, `prisma:migrate`, `prisma:studio`).
- Add `api/prisma.config.ts` (Prisma 7 standard name). Stop relying on `prisma7.config.ts` alone.
- `PrismaModule` / `PrismaService` with `PrismaPg` adapter.
- `main.ts`: Helmet, cookie-parser, CORS from `WEB_URL`, global prefix `api`, URI version `v1`, `ValidationPipe`, Swagger in non-production.
- Listen `0.0.0.0` on `PORT` (already 4000 in `.env`).
- `GET /api/health` and `GET /api/ready` (Postgres ping).
- Typed `ConfigModule` (fail fast if secrets missing).

### 0.2 Storage and mail plumbing

- Ensure MinIO bucket `fieldops-dev` exists (compose init or boot script).
- Storage module interface (no product uploads yet).
- Mail module pointed at Mailpit (no product emails yet except what auth needs in phase 1).

### 0.3 Web bootstrap

- Replace create-next-app page/metadata.
- Apply FieldOps tokens + Geist wiring (see design system).
- Fix `web/.gitignore` so `.env.example` is not ignored.
- API client stub with `credentials: "include"`.

### 0.4 Exit criteria

- `api` starts on 4000, `web` on 3000, health is green against Docker Postgres.
- `prisma migrate` can run (even with a first empty or bootstrap migration once models exist in phase 1).

---

## Phase 1 — Identity, tenancy, session

**Schema:** User, RefreshSession, Organization, OrganizationSettings, OrganizationMembership, Invitation, Subscription (placeholder row), AuditEvent.

**API:**

- Register, verify email, login, refresh, logout, password reset
- HTTP-only cookies
- Create organization (creator = OWNER)
- List memberships, switch org, session payload
- Invite / accept / revoke
- Role change, deactivate member, last-owner protection
- Org settings update
- Tenant isolation tests (A cannot read B)

**Web:**

- Login / register / reset
- Org create and org picker
- Authenticated empty shell (no fake dashboard data)

**Exit criteria:** Two browsers, two orgs, zero cross-tenant leakage. Tokens not in localStorage.

---

## Phase 2 — Product chrome (desktop + mobile)

No jobs yet.

- `DesktopShell`: collapsible rail, top bar, command palette frame
- `MobileShell`: header, bottom nav (Home / Jobs / Schedule / Time / More), safe areas
- Responsive switch
- Settings screen for org profile/timezone
- Empty states for upcoming modules

**Exit criteria:** 320px and 1440px both feel intentional. Keyboard can open the palette chrome.

---

## Phase 3 — Clients, sites, crew

**Schema:** Client, Site, Team, TeamMember, TechnicianProfile.

**API:** CRUD with org scope, soft-deactivate, composite FKs, search.

**Web:** Desktop tables + mobile full-screen sheets. No dummy rows in components.

**Exit criteria:** Office user can model a small contractor (clients, two sites, one team, two technicians). Technician role cannot mutate the catalog beyond what PRD allows.

---

## Phase 4 — Job cards and schedule

**Schema:** OrganizationCounter, Job, JobAssignment.

**API:** Create/update, numbering in a transaction, assignments, status transitions (subset is fine: DRAFT/SCHEDULED/DISPATCHED/IN_PROGRESS/COMPLETED/CANCELED). Schedule query by day/week and technician.

**Web:** Jobs table, job detail, desktop schedule board (simple), mobile Jobs + Schedule lists.

**Exit criteria:** Dispatch a job to a technician; technician only sees assigned jobs.

---

## Phase 5 — My Day, clock, GPS, evidence

**Schema:** ClockEvent, GpsEvidence, WorkLog, FileObject, JobPhoto, JobSignature, Material, JobMaterial (materials may slip to 5b).

**API:** Clock in/out (server time), optional GPS per settings, work logs, validated uploads, completion rules.

**Web:** Technician Home / My Day, camera-first photo, signature pad, sticky clock action.

**Exit criteria:** A technician can complete a job with required evidence. Office sees it on the job card. Files inaccessible with a guessed key from another org.

---

## Phase 6 — Time, overtime, approvals, notifications

**Schema:** Timesheet, TimesheetEntry, Approval, Notification.

**API:** Build timesheets from clocks; overtime flags from settings; submit/approve; action-center list; in-app notifications + email for invites (already) and approval events.

**Web:** Time screens, approvals in top bar / action center, notification list.

**Exit criteria:** Supervisor can reject a timesheet; technician sees the result. Audit rows exist for decisions.

---

## Phase 7 — Dashboard, reporting, audit UI

- Asymmetric desktop dashboard using **real** aggregates
- Role-scoped reports
- Audit history for owner/admin
- Super-admin platform list/suspend (no tenant file browsing)

**Exit criteria:** Dashboard is empty-safe (real zeros, not fake charts).

---

## Phase 8 — Billing (explicitly later)

- Stripe customer + subscription mapping
- Seat/storage enforcement
- Customer portal
- Webhook signature verification

Do not start this phase until asked.

---

## Phase 9 — Hardening (ongoing after phase 1)

- Playwright happy paths
- RLS evaluation
- PWA / offline capture
- Dark theme completion
- Same-origin production proxy on Railway
- CSV export

---

## Suggested first implementation tickets (after docs)

1. Prisma 7 config + migrate pipeline
2. Nest bootstrap (prefix, pipes, cookies, CORS, health)
3. FieldOps tokens + shells
4. Auth cookies + User model
5. Organization + membership + session org switch
6. Isolation test suite
7. Clients/sites
8. Jobs + assignments
9. My Day + clock
10. Files + signatures
11. Timesheets + approvals

---

## Definition of done (every feature)

- DTO validation
- Membership-scoped queries
- Audit on important mutations
- UTC timestamps
- No hashes/tokens in responses
- Empty/error/forbidden states in UI
- No copy from previous client apps
- No unrelated refactors
- Prisma still v7

---

## Setup problems detected (current tree)

These are real findings from repository inspection. They belong in phase 0, not later product work.

| # | Problem | Impact |
| --- | --- | --- |
| 1 | `api/prisma/schema.prisma` has no models | Cannot persist anything |
| 2 | Prisma config is `prisma7.config.ts`; Prisma 7 CLI looks for `prisma.config.ts` | `prisma migrate` / `generate` will not pick up config by default |
| 3 | `prisma` CLI is not in `api/package.json` (only `@prisma/client` + adapter) | No first-class generate/migrate scripts |
| 4 | `prisma7.config.ts` imports `dotenv/config`; `dotenv` is not a declared dependency | Fragile CLI env loading |
| 5 | No `PrismaService`; generated client folder does not exist | API cannot talk to Postgres yet |
| 6 | `main.ts` is Hello World: no Helmet, CORS, cookies, global prefix, ValidationPipe, Swagger | Web env expects `http://localhost:4000/api` |
| 7 | Code default port `3000` conflicts with Next if `.env` is missing | Local bind clash |
| 8 | Installed auth/storage/mail packages are unused | Fine for now; wire in phase 0–1, do not leave secrets half-wired |
| 9 | Next.js still create-next-app; metadata “Create Next App” | Not the product |
| 10 | `globals.css` is default shadcn neutral; `--font-sans` circular; Geist not applied | Identity and a11y typography broken |
| 11 | `web/.gitignore` has `.env*` so `web/.env.example` is ignored by git | Example env will not be shared |
| 12 | MinIO has no bucket bootstrap | First upload will fail until `fieldops-dev` exists |
| 13 | No root README; `api/README.md` and `web/README.md` are framework starters | Onboarding unclear |
| 14 | Not a npm workspace; two separate installs | Documented; acceptable |
| 15 | Nest README / Mau deploy copy is leftover starter | Ignore; we target Railway-style hosting later |
| 16 | `cn` package used (shadcn nova); `tailwind-merge` not direct | Acceptable; do not restyle by swapping utils casually |
| 17 | Docker infra is healthy locally (Postgres, MinIO, Mailpit) | Good; keep using it |

Do not “fix everything” as drive-by work while implementing a later feature. Phase 0 exists so the foundation is intentional.
