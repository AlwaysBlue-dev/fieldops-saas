# Platform Super Admin

FieldOps Cloud platform administration for the **SaaS owner**. It is completely separate from customer organization administration.

## Access

- Only `User.platformRole = SUPER_ADMIN` may call `/api/platform/*` or use `/platform` UI.
- Org role (`OWNER`, `ADMIN`, …) never grants platform access.
- Backend `SuperAdminGuard` is authoritative. Hidden navigation is not security.
- Non–super-admins receive **403** on platform APIs (including direct URL/API attempts).
- There is no “login as customer” / impersonation feature.

## Routes (web)

| Path | Purpose |
|------|---------|
| `/platform` | Dashboard KPIs and recent signups |
| `/platform/organizations` | Searchable organization list |
| `/platform/organizations/[id]` | Detail + manual subscription controls |
| `/platform/activation-requests` | Activation queue |
| `/platform/invoices` | Manual invoices (existing billing tooling) |
| `/platform/requests` | Redirects to activation-requests |

Normal SaaS users never see `/platform` in the app shell. SUPER_ADMIN can open it from the shell or after login.

## Dashboard metrics

Real aggregates (no fake charts):

- Total / trial / grace / active / expired-trial / suspended organizations
- Total users
- Total jobs (count only — no job payloads)
- Open/contacted activation request count
- Recent signups (org name, plan, effective status, signup time)

Platform dashboard does **not** expose customer job lists, client records, or field notes.

## Organizations

Filter by name/slug search, organization status, effective subscription status, plan code, and created date range.

Detail shows:

- Company, owner, created date, timezone
- Subscription: plan, status, trial/grace/activation/period dates
- Usage: member count, job count, storage bytes (when files exist)

No automatic deep browse of jobs or clients for support unless a future authorized workflow is added.

## Manual subscription management

No Stripe, checkout, cards, or payment webhooks. SUPER_ADMIN can:

| Action | Effect |
|--------|--------|
| **Activate** | `status ACTIVE`, selected plan (Starter / Professional / Business), `currentPeriodStart` / `currentPeriodEnd` (default end ≈ +1 year, editable), `activatedAt`, `activatedBy`. Org regains mutation access. Open activation requests for that org are **CLOSED**. |
| **Extend trial** | `+7` / `+14` / `+30` days or custom `trialEndsAt`. Does not wipe org data. |
| **Change plan** | Switches plan without requiring payment. |
| **Set period** | Updates `currentPeriodStart` / `currentPeriodEnd`. |
| **Suspend** | Requires reason. Sets subscription + organization to suspended; operational mutations blocked per entitlement policy. Data retained. |
| **Reactivate** | Clears suspension; returns to ACTIVE if previously activated, else TRIALING. |
| **Cancel** | Marks subscription cancelled / read-only per policy. Data retained. |

API prefix: `/api/v1` is not used; routes are under `/api/platform/...` (global `/api` prefix).

Examples:

- `POST /api/platform/organizations/:id/subscription/activate`
- `POST /api/platform/organizations/:id/subscription/extend-trial` body `{ days }` or `{ trialEndsAt }`
- `POST /api/platform/organizations/:id/subscription/suspend` body `{ reason }`
- `POST /api/platform/organizations/:id/subscription/set-period`
- `GET /api/platform/dashboard`
- `GET /api/platform/activation-requests`

## Activation requests

`GET/PATCH /api/platform/activation-requests` (also available as `commercial-requests`).

Queue fields: organization, owner, email, requested date, message, status.

Actions: Mark Contacted, Activate Organization (via activate endpoint), Close.

Activating an organization closes matching open/contacted **ACTIVATION** requests automatically.

## Platform audit actions

Written via `AuditService` with SUPER_ADMIN as `actorUserId`, scoped `organizationId`, timestamp, and old/new values:

| Action | When |
|--------|------|
| `ORGANIZATION_ACTIVATED` | Manual activate |
| `TRIAL_EXTENDED` | Trial extension |
| `PLAN_CHANGED` | Plan change |
| `ORGANIZATION_SUSPENDED` | Suspend (includes reason) |
| `ORGANIZATION_REACTIVATED` | Reactivate |
| `ORGANIZATION_CANCELLED` | Cancel |
| `ACTIVATION_REQUEST_UPDATED` | Request status change or auto-close on activate |
| `SUBSCRIPTION_PERIOD_SET` | Explicit period update |
| `SUBSCRIPTION_RENEWED` | Manual renew |

## Security checklist

- [x] OWNER / normal USER cannot call platform APIs
- [x] SUPER_ADMIN can
- [x] Activation restores mutations
- [x] Trial extension works (+days and custom date)
- [x] Suspension requires reason and blocks mutations
- [x] Path param org id is authoritative (body `organizationId` ignored)
- [x] Audits recorded for critical platform actions

## Tests

```bash
cd api
npm run test:e2e -- test/platform-admin.e2e-spec.ts
npm run test:e2e -- test/subscription.e2e-spec.ts
```
