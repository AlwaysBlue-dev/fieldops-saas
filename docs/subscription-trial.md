# FieldOps Cloud — Free trial and manual activation

The initial commercial model, paid renewal grace, catalog-driven pricing, and platform admin flow live in `docs/commercial-model.md`. This file keeps the trial math that still applies.

No payment provider is connected. Access is decided on the API from subscription dates and operator-set statuses. The browser never authorizes writes.

## Policy

New organizations receive:

- 14 days of trial access
- 3 additional days of grace
- Professional feature entitlement during trial and grace
- No credit card

| Window | Effective status | Mutations |
| --- | --- | --- |
| Days 1–14 (`now <= trialEndsAt`) | `TRIALING` | Allowed |
| Days 15–17 (`now <= graceEndsAt`) | `GRACE` | Allowed, with a non-blocking warning |
| Day 18+ (`now > graceEndsAt`) | `TRIAL_EXPIRED` | Read-only |

Expired workspaces keep all data, users, and files. People can still sign in, read jobs/clients/sites/timesheets/reports, and open account/subscription screens.

They cannot create or edit jobs, clock in/out, create clients/sites, invite members, add materials, upload photos, create timesheets, or approve workflow records.

Owner/admin copy after expiry: **Your trial has ended** and **Contact us to activate your workspace.** There is no checkout button.

## Stored vs effective status

`Subscription.status` is the last written value. Authorization uses **effective** status:

1. Stored `SUSPENDED` → `SUSPENDED` (read-only)
2. Stored `CANCELLED` or legacy `CANCELED` → `CANCELLED` (read-only)
3. Stored `ACTIVE` → `ACTIVE` (mutations allowed)
4. Otherwise compute from `trialEndsAt` / `graceEndsAt` at request time

A later reconciliation job may persist `GRACE` / `TRIAL_EXPIRED` for reporting. Security must not wait for that job.

## Schema

`Subscription` fields used by this slice:

- `status`, `planId`
- `trialStartedAt`, `trialEndsAt`, `graceEndsAt`
- `currentPeriodStart`, `currentPeriodEnd`
- `activatedAt`, `activatedByUserId`
- `cancelAtPeriodEnd`
- `createdAt`, `updatedAt`

Statuses supported: `TRIALING`, `GRACE`, `ACTIVE`, `TRIAL_EXPIRED`, `SUSPENDED`, `CANCELLED`. Legacy `NONE`, `PAST_DUE`, and `CANCELED` remain on the enum.

`ActivationRequest` stores a lightweight sales request: organization, requester, optional message, `OPEN` | `CONTACTED` | `CLOSED`, timestamps.

Published commercial offer is **FieldOps Cloud Professional** at **$499/year**: 14-day trial, no credit card, 3-day grace, 10 users, 20 GB, core field-service features, product updates, and standard support. Larger seat or storage needs are **Business** pricing by contact. Starter remains in the catalog for existing workspaces. Trial evaluation always overlays Professional features.

## Services and guards

- `resolveEntitlement()` / `SubscriptionAccessService` are the only trial-math entry points
- `@RequiresActiveSubscription()` applies `SubscriptionAccessGuard` to operational mutations
- GET/read routes, auth, profile, `GET .../subscription`, and activation requests stay available after expiry
- `CLOCK` can be replaced in tests; production uses wall clock

## Tenant API

- `GET /api/organizations/:organizationId/subscription`  
  Returns stored `status`, `effectiveStatus`, `plan`, trial/grace dates, remaining days, `readOnly` / `canMutate`, and `features`
- `POST /api/organizations/:organizationId/activation-requests`  
  Owner/admin. Writes `ActivationRequest`, audit `ACTIVATION_REQUESTED`, emails `PLATFORM_SALES_EMAIL` (Mailpit in local)

## Platform API (SUPER_ADMIN only)

These routes do not use tenant membership and do not grant access to jobs/files.

| Action | Route | Effect |
| --- | --- | --- |
| Activate | `POST /api/platform/organizations/:organizationId/subscription/activate` | `ACTIVE`, selected plan, period dates, `activatedAt` / `activatedByUserId`, restore mutations |
| Extend trial | `POST .../extend-trial` | Move `trialEndsAt` forward, `graceEndsAt = trialEndsAt + 3 days`, status `TRIALING` |
| Suspend | `POST .../suspend` | Status `SUSPENDED` (org row stays `ACTIVE` so reads still work) |
| Reactivate | `POST .../reactivate` | `ACTIVE` if previously activated, otherwise `TRIALING` |
| Cancel | `POST .../cancel` | `CANCELLED` |

Activate body example:

```json
{
  "planCode": "professional",
  "currentPeriodStart": "2026-09-23",
  "currentPeriodEnd": "2027-09-23"
}
```

`planId` is also accepted. Local seed user: `platform.admin@fieldops.local`.

## Audit actions

`TRIAL_STARTED`, `TRIAL_EXTENDED`, `ACTIVATION_REQUESTED`, `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_SUSPENDED`, `SUBSCRIPTION_REACTIVATED`, `SUBSCRIPTION_CANCELLED`.

## Frontend

`SubscriptionProvider` / `useSubscription()` load server entitlement for the selected org. Banners:

- Trial: quiet “N days left in trial”
- Final 3 trial days: stronger warning
- Grace: remaining grace days
- Expired/suspended/cancelled: persistent read-only banner plus Request Activation

Mutation controls (Create Job, Clock In, Add Client, Invite Member, Approve, New) disable with **Available after account activation.** Backend enforcement remains authoritative.

## Environment

```
PLATFORM_SALES_EMAIL=sales@fieldops.local
```

Optional. Defaults to `sales@fieldops.local` for Mailpit.
