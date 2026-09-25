# FieldKeel — Architecture

This document describes the intended architecture for FieldKeel based on the current repository, not a hypothetical greenfield stack. Business modules are not implemented yet.

---

## 1. Current repository (as inspected)

The repo is a two-package application with local Docker dependencies. It is **not** a workspace monorepo (no root `package.json`).

```
fieldops-saas/
  web/                 Next.js App Router (v16) + React 19 + Tailwind 4 + shadcn/Radix
  api/                 NestJS 12 (ESM) + Prisma ORM 7 + PostgreSQL driver adapter
  infrastructure/      docker-compose.dev.yml (Postgres 17, MinIO, Mailpit)
  docs/                product and engineering documents
```

### 1.1 Web (`web/`)

| Item | Current state |
| --- | --- |
| Framework | Next.js `16.3.6` App Router |
| UI | React `19.2.8`, Tailwind CSS 4, shadcn `radix-nova`, Lucide |
| Forms / validation | react-hook-form, Zod 4, `@hookform/resolvers` |
| Charts / dates | recharts, date-fns, react-day-picker |
| Entry | Default create-next-app page; metadata still “Create Next App” |
| Tokens | Default shadcn neutral theme (must be replaced with FieldKeel identity) |
| Fonts | Geist and Geist Mono loaded; `--font-sans` is not correctly wired to Geist |
| Env | `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_API_URL` (expects `http://localhost:4000/api`) |
| Cookies / auth | Not implemented |
| Business routes | None |

Next.js 16 has breaking changes versus older training data. Before writing app code, read `web/node_modules/next/dist/docs/`.

### 1.2 API (`api/`)

| Item | Current state |
| --- | --- |
| Framework | NestJS 12, `"type": "module"`, `moduleResolution: nodenext` |
| Data | Prisma **7.10** (`prisma-client` generator, `@prisma/adapter-pg`, `pg`) |
| Schema | Empty: generator + PostgreSQL datasource only. No models, no migrations |
| Config file | `prisma7.config.ts` (Prisma 7 expects `prisma.config.ts`) |
| Prisma CLI | `@prisma/client` is installed; the `prisma` CLI package is **not** in `package.json` |
| Bootstrap | Stock Hello World on `PORT` (code default 3000; `.env` sets 4000) |
| Installed but unused | Config, JWT, Passport, cookies, Helmet, Throttler, Swagger, S3 SDK, Nodemailer, class-validator |
| Global prefix | None (web env already assumes `/api`) |
| Tests | Vitest + one starter controller spec |

### 1.3 Local infrastructure

`infrastructure/docker-compose.dev.yml` currently running:

- PostgreSQL 17 — `localhost:5432`, db `fieldops_saas`
- MinIO — API `9000`, console `9001` (bucket is **not** provisioned by compose)
- Mailpit — SMTP `1025`, UI `8025`

### 1.4 Production target (later)

- Managed hosting (e.g. Railway) for `web` and `api`
- Managed PostgreSQL
- S3-compatible object storage
- Transactional email
- Stripe subscriptions (not in first implementation)

Do not introduce Redis, RabbitMQ, Kubernetes, or extra Node services until explicitly approved.

---

## 2. Architectural principles

1. **The API is authoritative.** Permissions, workflow transitions, tenant checks, numbering, and completion rules live in NestJS. The web app is a client.
2. **PostgreSQL is the system of record.** No business records in `localStorage` / `sessionStorage`.
3. **Cookies, not token storage in JS.** Access and refresh JWTs are HTTP-only cookies. The browser never persists tokens in web storage.
4. **Bytes vs metadata.** Object storage holds files. PostgreSQL holds keys, MIME, size, checksum, tenant, purpose.
5. **UTC in, timezone out.** Persist `timestamptz` UTC. Organization timezone is used for display and business-day math.
6. **Transactions for critical writes.** Job completion, invitation accept, timesheet submit/approve, clock adjustment — one transaction, audit row included.
7. **Soft-deactivate referenced entities.** Clients, sites, members, materials stay in history.
8. **Strict DTOs.** `class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
9. **One deployable API.** Modular Nest monolith. Avoid premature microservices.
10. **Prisma stays v7** until an explicit, approved upgrade. Use the driver adapter. Do not use removed Prisma 6 APIs (`$use` middleware is gone).

---

## 3. Logical architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  Next.js App Router  —  FieldKeel shells (desktop + mobile)  │
│  credentials: include  —  no token storage                   │
└─────────────┬───────────────────────────────────────────────┘
              │ HTTPS, cookie session, CORS or same-origin proxy
┌─────────────▼───────────────────────────────────────────────┐
│  NestJS API  (/api/v1)                                       │
│  Helmet, cookie-parser, throttling, ValidationPipe           │
│  Auth guard → Org context guard → RBAC → domain services     │
│  PrismaClient + PrismaPg adapter                             │
└──────┬──────────────────┬──────────────────┬────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
 PostgreSQL          MinIO / S3           SMTP
 (source of          (objects)            (Mailpit now,
  truth)                                  ESP later)
```

The web app may:

- Call the API directly from the browser with `credentials: "include"` (local dev).
- Or same-origin reverse-proxy `/api/*` to Nest (preferred for production cookies).

The web app must **not**:

- Embed PostgreSQL or Prisma.
- Become a second source of authorization.
- Cache tenant lists or job payloads in localStorage.

---

## 4. Recommended NestJS module map (not generated yet)

Keep a modular monolith. Suggested modules when implementation starts:

| Module | Responsibility |
| --- | --- |
| `ConfigModule` | Typed env validation |
| `PrismaModule` | PrismaClient + `PrismaPg` adapter, lifecycle |
| `AuthModule` | Register, login, refresh, logout, password reset, cookies, JWT |
| `UsersModule` | Platform user profile, platform role |
| `OrganizationsModule` | Org CRUD, settings, slug |
| `MembershipsModule` | Roles, deactivate, last-owner guards |
| `InvitationsModule` | Create/accept/revoke, email |
| `AuditModule` | Append-only audit writer used by other modules |
| `StorageModule` | Presign or proxied upload, MIME/size, tenant key prefix |
| `MailModule` | Nodemailer transport (Mailpit/ESP) |
| `ClientsModule` / `SitesModule` | Customer records |
| `TeamsModule` / `TechniciansModule` | Crew |
| `JobsModule` | Job cards, assignments, workflow |
| `ScheduleModule` | Query model over jobs/assignments |
| `TimeModule` | Clock events, GPS evidence, timesheets, overtime |
| `FilesModule` | Photos, signatures metadata |
| `ApprovalsModule` | Action center |
| `NotificationsModule` | In-app + email fan-out |
| `ReportsModule` | Read models / aggregations |
| `PlatformModule` | Super-admin only |

Do not create these folders until the corresponding roadmap phase. Do not add a `BillingModule` until billing is approved.

---

## 5. Request lifecycle (tenant-safe)

Every authenticated tenant request follows this path:

1. **Parse cookies.** Access token from HTTP-only cookie.
2. **Authenticate.** JWT signature, expiry, user still active. On access expiry, refresh rotation via refresh cookie.
3. **Resolve organization selection.** Cookie or header such as `X-Organization-Id` / `fieldops_org` is a **hint**.
4. **Authorize membership.** Load `OrganizationMembership` where `userId + organizationId + status = ACTIVE`. If missing → `403`. Super-admin platform routes skip this and **do not** inherit tenant data rights.
5. **Bind `RequestContext`.** `{ userId, platformRole, organizationId, membershipId, orgRole, timezone }`. Services never take `organizationId` from the DTO as proof.
6. **Authorize action.** Role/permission check for the command (e.g. technician cannot list all jobs).
7. **Query with tenant predicate.** Every tenant table access includes `organizationId` from context. Resource IDs are looked up **inside** that organization (`findFirst({ where: { id, organizationId } })`), never `findUnique({ where: { id } })` alone.
8. **Mutate in a transaction** when the operation is critical; write audit metadata.
9. **Return a DTO.** Strip hashes, tokens, internal flags.

If the client sends `organizationId` in a body, it may only be used on explicit org-management endpoints after membership checks. For job/client/site routes it is ignored or rejected if it disagrees with context.

---

## 6. Web application architecture

### 6.1 Rendering

- Use the App Router. Prefer Server Components for static chrome and marketing/auth layout shells.
- Use Client Components for interactive operations UI (schedule, command palette, signature pad, camera).
- Do not put secrets in `NEXT_PUBLIC_*`. Only app name and API base URL are public.

### 6.2 Route map (proposed)

Public:

- `/` marketing or login redirect
- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/invitations/accept`

Authenticated:

- `/app` — org picker if multiple memberships
- `/app/[orgSlug]` — desktop dashboard / mobile home
- `/app/[orgSlug]/jobs`, `clients`, `sites`, `schedule`, `teams`, `time`, `approvals`, `reports`, `settings`
- `/app/[orgSlug]/jobs/[jobId]`
- Technician-first aliases can map into the same pages with a mobile shell

Platform:

- `/platform/...` — super-admin only

`orgSlug` in the URL is navigation, not authorization. The API still verifies membership. If slug and session org disagree, switch via the session endpoint or 404.

### 6.3 Data access from the web

Create a single API client:

- `credentials: "include"`
- CSRF strategy as defined in the security model
- Maps 401 → refresh-once → login
- Maps 403 → permission UI
- Never stores the response bodies in localStorage

React Query / SWR may be added later. Until then, server fetch + client hooks are acceptable. Do not invent a global client-side database.

---

## 7. Authentication and cookies

Recommended cookie set (names can be finalized at implementation):

| Cookie | HttpOnly | Purpose |
| --- | --- | --- |
| `fieldops_access` | Yes | Short-lived JWT (~15m) |
| `fieldops_refresh` | Yes | Longer-lived JWT (~7d), rotated, stored hashed in DB |
| `fieldops_org` | Yes | Last selected organization id (selection only) |

Flags:

- `Secure` in production; false on local HTTP
- `SameSite=Lax` for same-site; production should aim for first-party cookies
- `Path=/`
- `Domain` unset in local dev; sibling parent domain only if web and API share a registrable domain

**Local ports:** `web` on `:3000`, `api` on `:4000` are different origins. CORS must allow `WEB_URL` with `credentials: true`. Cookies on `localhost` are host-based (not port-based); do not assume that is true in production.

**Production recommendation:** terminate both apps behind one public origin (Next rewrite/proxy `/api` → Nest) so session cookies are first-party. Alternative: `app.` + `api.` on a shared parent domain.

Refresh tokens are persisted as **hashes**. Logout and password change revoke them.

Passport JWT strategy should read the access cookie, not an `Authorization` header, by default. A header may be allowed later for first-party native apps, not for the browser.

---

## 8. Prisma ORM 7

This project is already on Prisma 7. Treat the following as mandatory:

- Generator `provider = "prisma-client"` with explicit `output`.
- Connection via `PrismaPg` adapter + `pg` pool. No connection without adapter.
- Datasource URL in `prisma.config.ts`, not in `schema.prisma`.
- Load env explicitly (`dotenv/config`) for CLI.
- Import client from the generated output (`api/generated/prisma`), not `@prisma/client` runtime models.
- **No Prisma middleware** (`$use` removed). Tenant isolation is application-level (guards + query helpers).
- Keep Prisma on v7.x until an explicit upgrade is approved.

Immediate config work (roadmap phase 0), not done in this documentation task:

- Rename/add `api/prisma.config.ts`
- Add `prisma` CLI + scripts (`prisma generate`, `migrate:dev`)
- Introduce `PrismaService` that constructs `new PrismaClient({ adapter })`

---

## 9. Files and email

### 9.1 Object storage

- Dev: MinIO, path-style, bucket `fieldops-dev`.
- Prod: any S3-compatible provider.
- Key layout: `org/{organizationId}/{purpose}/{year}/{id}.{ext}`
- Never use a globally guessable key. Never serve the bucket publicly.
- Upload flow: authenticated API either (a) receives the file through a validated Nest endpoint, or (b) issues a short-lived presigned PUT bound to that key, then confirms metadata.
- Confirm step writes `FileObject` in Postgres. Orphaned blobs can be garbage-collected later.
- Photos and signatures are downloaded through an authorized API redirect/stream, not a public URL.

### 9.2 Email

- Dev: Mailpit (`localhost:1025`, UI `:8025`).
- Prod: transactional provider with the same Nodemailer interface.
- Templates: invitation, verify email, password reset. No marketing blast system.

---

## 10. Time, numbers, and concurrency

- Database timestamps: `timestamptz`, written in UTC.
- Organization `timezone` (IANA) used for “today”, timesheet periods, overtime day boundaries, and UI clocks.
- Job numbers: per-organization sequence allocated inside a transaction (table `organization_counters` or equivalent) to avoid duplicates under concurrency.
- Clock-in uniqueness: at most one open clock for a user in an organization.

---

## 11. Testing architecture

| Layer | Tool | Must cover |
| --- | --- | --- |
| Unit | Vitest | Workflow transitions, overtime math, DTO invariants |
| API integration | Vitest + Nest testing | Auth cookies, tenant isolation, RBAC |
| E2E later | Playwright (web) | Login, org switch, My Day clock-in |

The first test that must exist when tenancy ships: **user in org A requesting org B’s job id receives 404/403, never the payload.**

Do not mock away the `organizationId` predicate in repository tests.

---

## 12. Deployment shape (future)

Two services:

1. `web` — Next.js `next build` / `next start`
2. `api` — `nest build` / `node dist/main.js` listening on `0.0.0.0:$PORT`

Managed Postgres, S3, SMTP. Horizontal scale of the API is possible because the session is JWT + refresh rows in Postgres — still no Redis required.

Health endpoints (`GET /api/health`, `/api/ready` checking Postgres) should be added in bootstrap. They are not present now.

---

## 13. Explicit non-goals for architecture

- Do not split “jobs-service”, “auth-service”, etc.
- Do not add Redis for sessions or queues yet.
- Do not store files on the local disk of the API.
- Do not use Next.js Route Handlers as the business API.
- Do not read Prisma from the web package.
- Do not copy architecture, folder names, or auth shortcuts from any previous client codebase.
