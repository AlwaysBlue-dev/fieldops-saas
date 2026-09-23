# Plan entitlements and usage enforcement

No payment integration. Limits and features come from `Plan` + `Subscription`. Enforcement is server-side only.

## Services

| Service | Responsibility |
|---------|----------------|
| `EntitlementService` | Resolve effective subscription + plan snapshot, feature flags, access-until |
| `UsageService` | Seat/storage counts, `GET` usage summary, assert limits |
| `SubscriptionAccessService` | Thin facade for existing call sites |

Do **not** scatter `if (plan === 'PRO')` checks. Use:

```ts
await entitlements.hasFeature(organizationId, PLAN_FEATURES.ADVANCED_REPORTS);
await usage.assertSeatAvailable(organizationId, { reservingInvite: true, actorUserId });
await usage.assertStorageAvailable(organizationId, bytes, { actorUserId });
```

## Features

Conceptual keys in `plan-features.ts`:

- `JOBS`, `TIMESHEETS`, `GPS`, `CLIENT_SIGNATURE`, `ADVANCED_REPORTS`, `CUSTOM_BRANDING`

Most field functionality is enabled on all plans; **limits** (`maxUsers`, `maxStorageBytes`) differ. Seeded `Plan.features` JSON carries these flags.

## Limits

From `Plan`:

- `maxUsers` — ACTIVE members + PENDING invites (when inviting) + 1
- `maxStorageBytes` — sum of `JobFile.sizeBytes` + incoming upload size

On breach, API returns **403** with structured body:

```json
{
  "statusCode": 403,
  "error": "PLAN_LIMIT_REACHED",
  "code": "PLAN_LIMIT_REACHED",
  "message": "You've reached the 10-user limit on your Professional plan.",
  "limitType": "USERS",
  "used": 10,
  "limit": 10,
  "planCode": "professional",
  "planName": "Professional"
}
```

Frontend CTA: **Request plan change** (not Pay now).

Seat/storage blocks also write a single `PLAN_LIMIT_BLOCKED` audit (not on successful checks).

## Tenant API

- `GET /api/organizations/:id/subscription` — entitlement + nested usage
- `GET /api/organizations/:id/usage` — members `{ used, limit }`, storage `{ usedBytes, limitBytes }`, `jobsThisMonth`, features
- `POST /api/organizations/:id/plan-change-requests` — Owner/Admin → `PLAN_CHANGE` commercial request + `PLAN_CHANGE_REQUESTED` audit

## UI

Settings → **Plan & Usage** (`/app/[orgSlug]/settings/plan-usage`):

- Current plan, status, access until
- Team seats `used / limit`
- Storage `used / limit`
- Features list
- Request plan change / Contact Sales

## Platform

`SUPER_ADMIN` continues to assign plans via `POST /api/platform/organizations/:id/subscription/change-plan` (`PLAN_CHANGED` audit).

## Audits

| Action | When |
|--------|------|
| `PLAN_CHANGED` | Platform assigns a new plan |
| `PLAN_CHANGE_REQUESTED` | Tenant requests a plan change |
| `PLAN_LIMIT_BLOCKED` | Seat or storage assert rejects |

## Tests

```bash
cd api
npm run test:e2e -- test/entitlements.e2e-spec.ts
npm run test:e2e -- test/subscription.e2e-spec.ts
```
