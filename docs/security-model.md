# FieldKeel — Security Model

FieldKeel stores contractor customer data, job photos, GPS points, signatures, and timesheets. Tenant isolation and session hygiene are product features, not later hardening.

This document reflects the implemented API foundation (`/api`). Field-service UI is not in scope yet.

---

## 1. Threats we design for

| Threat | Outcome we prevent |
| --- | --- |
| Cross-tenant IDOR | User guesses a UUID and reads another company’s job, photo, or GPS point |
| Confused deputy | Frontend sends `organizationId` of an org the user does not belong to |
| Privilege confusion | `User.role` used as if it were OWNER/TECHNICIAN |
| Token theft via XSS | Access JWT sitting in `localStorage` |
| Replay of invite/refresh tokens | Tokens stored or logged in plaintext |
| Upload abuse | Executable or oversized files in the bucket |
| Workflow cheat | UI sets job status to COMPLETED without evidence rules |
| Super-admin overreach | Platform operators silently browsing tenant photos |

---

## 2. Identity vs authorization

### 2.1 Two role axes

```
User.platformRole            →  USER | SUPER_ADMIN     (platform)
OrganizationMember.role      →  OWNER | ADMIN | OPERATIONS_MANAGER | SUPERVISOR | TECHNICIAN
```

Rules:

- Authentication answers “who is this user?”
- Membership answers “which tenant, with which job?”
- A valid login does **not** grant access to any organization.
- A user with zero ACTIVE memberships can authenticate but cannot load tenant data.
- `SUPER_ADMIN` is a platform role only. It does **not** bypass `OrganizationMembershipGuard`. Tenant routes still require an ACTIVE membership in that organization.

### 2.2 Organization id is not a credential

Operational URLs use explicit context:

`/api/organizations/:organizationId/...`

Optional header `X-Organization-Id` is the same kind of **selection**, used only when the path has no org id.

Never:

- Trust `body.organizationId` as authorization
- Trust the URL/header without loading an ACTIVE `OrganizationMember`
- Authorize because the SPA “already filtered” the list

After `JwtAuthGuard` + `OrganizationMembershipGuard`:

```
request.user            → AuthUser (no passwordHash)
request.organization    → { organizationId, membershipId, role, slug, timezone, ... }
```

Decorators: `@CurrentUser()`, `@CurrentOrganization()`, `@OrganizationRoles(...)`.

Services query tenant rows with `{ id, organizationId }` from that context.

---

## 3. Authentication (implemented)

### 3.1 Password

- bcrypt cost factor 12.
- Emails stored lowercase.
- Login failures use a generic `Invalid credentials` message.
- Inactive accounts (`User.status = INACTIVE`) receive **403** `Account is inactive` and cannot obtain cookies.
- Auth routes are rate-limited (`@Throttle` on signup/login/refresh). The throttler is skipped when `NODE_ENV=test` so automated suites stay deterministic.

### 3.2 Session cookies

Tokens are issued in **HTTP-only cookies only**. JSON responses never include JWTs.

| Cookie | HttpOnly | Secure (prod) | SameSite | Lifetime |
| --- | --- | --- | --- | --- |
| `fieldops_access` | Yes | `COOKIE_SECURE` | `COOKIE_SAME_SITE` (dev: Lax) | `JWT_ACCESS_EXPIRES_IN` (15m) |
| `fieldops_refresh` | Yes | same | same | `JWT_REFRESH_EXPIRES_IN` (7d) |

Access JWT claims: `sub` (userId), `sid` (refresh session id), `typ: access`.  
Refresh JWT claims: `sub`, `sid`, `typ: refresh`.

**Not** in the access token: `orgRole`, `organizationId`. Membership is loaded from Postgres on every tenant request.

`RefreshSession.tokenHash` is SHA-256 of the refresh JWT. Refresh rotates: old row revoked, new session + cookies. Reuse of a revoked refresh token revokes remaining live sessions for that user.

Each authenticated request also checks that `sid` is still unrevoked, so logout invalidates leftover access cookies.

Logout clears both cookies and revokes the refresh row.

Forbidden:

- `localStorage` / `sessionStorage` for tokens
- Returning bearer tokens in JSON for the browser app

### 3.3 CORS and CSRF

- CORS origin is `WEB_URL` with `credentials: true`. No `*`.
- Mutating requests must send `X-FieldOps-Requested-With: web`. GET/HEAD/OPTIONS and `/health` are exempt.
- Helmet is enabled. Cookies are first-party in production if the web app proxies `/api`.

### 3.4 Organization invitations

- `POST /api/organizations/:organizationId/invitations` is OWNER/ADMIN only. Membership is loaded from the database; the URL org id is selection.
- The emailed secret is a random URL token. Only `OrganizationInvitation.tokenHash` (SHA-256) is stored.
- One PENDING invite per organization + email (partial unique index). TTL 7 days. Accept is one-time (`ACCEPTED`). Resend rotates the hash. Revoke sets `REVOKED`.
- `GET /api/invitations/:token` returns org name, role, email, expiry — never the hash.
- Accept: existing users must be signed in as the invited email; new users create an account on that email. Tokens are never returned in JSON.
- Last ACTIVE OWNER cannot be demoted or deactivated.

### 3.5 Email verification

- Signup creates a User with `emailVerifiedAt = null` and a hashed, single-use `EmailVerificationToken` (24h TTL). Organization, membership, and trial are **not** created at signup.
- Raw token is emailed via `MailService` (SMTP/Mailpit locally; configured provider in production). Link: `{APP_URL}/verify-email?token=…`. Raw tokens are never logged or stored.
- `POST /api/auth/verify-email` consumes a valid token and sets `User.emailVerifiedAt`. Refreshing or replaying the token fails safely.
- `POST /api/auth/resend-verification` (authenticated, rate-limited) invalidates unused tokens and issues a new one.
- `POST /api/auth/create-workspace` (authenticated + verified) creates Organization, OWNER membership, settings, and counter. If `User.trialUsedAt` is null, provisions a Professional trial subscription and sets `trialUsedAt` in the same transaction. If the account already used its trial, requires a `planCode` and creates a `NONE` subscription awaiting activation (no second trial).
- Tenant organization routes require `emailVerifiedAt != null` (enforced in `OrganizationMembershipGuard`). Auth routes for verify/resend/logout/login/password reset remain available.
- Organization invitations: accepting an invite for the invited email proves possession — new invitees are created verified; existing unverified users matching the invite email are marked verified on accept.

### 3.6 Password reset

- `POST /api/auth/forgot-password` always returns the same public message whether or not an ACTIVE account exists (no email enumeration).
- Eligible accounts get a hashed, single-use `PasswordResetToken` (30 minute TTL). Prior unused reset tokens for that user are marked used when a new one is issued.
- Raw token is emailed only via `MailService` (SMTP/Mailpit locally; configured provider in production). The link targets `{APP_URL}/reset-password?token=…`. Raw tokens are never logged or stored.
- `POST /api/auth/reset-password` validates the hashed token, updates `User.passwordHash`, marks the token used, invalidates other outstanding reset tokens, and revokes all active `RefreshSession` rows for that user.
- Both endpoints are rate-limited. Audit actions: `auth.password_reset_requested`, `auth.password_reset_completed` (no raw token or password).

### 3.7 Signup and workspace provisioning

`POST /api/auth/signup` atomically creates:

1. `User` (`emailVerifiedAt` null)
2. `EmailVerificationToken` (hashed)

Audit row `auth.signup` is written in the same transaction. Mail is sent after commit.

`POST /api/auth/create-workspace` (verified session) locks the user row (`FOR UPDATE`) and atomically creates:

1. `Organization`
2. `OrganizationMember` with `OWNER`
3. `OrganizationSettings` + `OrganizationCounter`
4. `Subscription` — either Professional `TRIALING` (first lifetime trial) or selected plan with status `NONE` (additional workspace)
5. When trialing: set `User.trialUsedAt` and audit `user.first_trial_consumed` + `TRIAL_STARTED`
6. When not trialing: audit `organization.created_without_trial`

Audit row `organization.created` is always written in the same transaction.

---

## 4. Authorization (implemented)

### 4.1 Guards

| Guard | Effect |
| --- | --- |
| `JwtAuthGuard` | Valid access cookie, live session, `User.status = ACTIVE` |
| `EmailVerifiedGuard` / membership guard | Unverified email → **403** (`EMAIL_NOT_VERIFIED`) on tenant routes |
| `OrganizationMembershipGuard` | ACTIVE membership in the URL/header org; otherwise **404** |
| `OrganizationRolesGuard` | `@OrganizationRoles(...)` — in-org but wrong role → **403** |

### 4.2 Status code policy

| Situation | Status | Why |
| --- | --- | --- |
| Missing/invalid session | **401** | Not authenticated |
| Inactive user login | **403** | Account exists but cannot act |
| Not a member of the URL organization | **404** | Do not confirm the org exists |
| Resource id belongs to another tenant | **404** | Do not confirm the record exists |
| Member of the org, role cannot perform the action | **403** | Existence in-tenant is already implied by membership |

Cross-tenant IDOR tests (Northstar vs BluePeak) must return **404** and must not include the foreign record in the body.

### 4.3 Tenant routes currently exposed

These exist so authorization can be enforced and tested. They are not a full field-service product API.

- `GET /api/organizations/:organizationId/jobs/:jobId` — any ACTIVE member
- `PATCH /api/organizations/:organizationId/jobs/:jobId` — OWNER, ADMIN, OPERATIONS_MANAGER, SUPERVISOR
- `GET /api/organizations/:organizationId/clients/:clientId` — any ACTIVE member
- `GET /api/organizations/:organizationId/files/:fileId` — job file **metadata** only (no `objectKey`)
- `POST /api/organizations/:organizationId/approvals/:approvalId/decide` — OWNER, ADMIN, OPERATIONS_MANAGER, SUPERVISOR

Lookups always use `withTenant(organizationId, { id })`.

---

## 5. Tenant isolation checklist

1. Tenant tables include `organizationId`.
2. Composite FKs keep children aligned with the parent org.
3. Tenant reads use `findFirst({ where: { id, organizationId } })`, never id alone.
4. Unique business keys are org-scoped.
5. Object keys will use `organizations/{organizationId}/jobs/{jobId}/...`.
6. Membership is re-checked on every tenant request.
7. Automated IDOR tests use seeded Northstar Electrical vs BluePeak HVAC UUIDs.

---

## 6. Data exposure rules

Responses must never include:

- `passwordHash`
- `tokenHash` / raw JWTs
- Other organizations’ memberships or records

`toPublicUser()` is the only user shape returned by auth.

---

## 7. Uploads

Unchanged: bytes in object storage, metadata in Postgres, type/size validation when upload APIs land. File **GET** currently returns metadata without storage keys.

---

## 8. Transport, headers, abuse

Implemented in `configureApp()`:

- Helmet
- Cookie parser
- CORS allow-list from `WEB_URL`
- `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`
- Structured `{ statusCode, message, error }` filter (no Prisma traces)
- Request logging: method, path, status, duration, user id, org id — no cookies/passwords
- Swagger at `/api/docs` in **development only**
- Throttling: global 120/min; stricter on auth endpoints

---

## 9. Audit and logging

`AuditLog` rows are written for:

- `auth.signup`
- `auth.login` / `auth.login_failed` (no password)
- `auth.logout`
- `organization.created`
- `job.updated`
- `approval.decided`

Failed login may store the attempted email in metadata. Tokens and password hashes are never logged.

---

## 10. Secrets and environment

- `.env` is gitignored. `validateEnv()` fails fast on invalid/missing required vars.
- Distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- `NEXT_PUBLIC_*` must never contain secrets.

---

## 11. Web application security

- Browser clients must use `credentials: "include"` and `X-FieldOps-Requested-With: web` on mutations.
- Do not persist tokens or tenant records in `localStorage`.
- `GET /api/me/organizations` is how the SPA lists memberships. Selecting an org only changes which URL the client calls; the API still verifies membership.

---

## 12. Super admin

Platform-only. No tenant data access through organization routes without a real membership. Break-glass is not implemented.

---

## 13. Future billing (do not implement)

When Stripe arrives: webhook signature verification, no trust of client `planCode`, map Stripe customer to `organizationId` server-side.
