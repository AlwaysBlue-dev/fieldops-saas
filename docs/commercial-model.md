# FieldOps Cloud — Initial commercial model

No payment gateway is connected. Customers trial the product, request activation, arrange payment with FieldOps, and a platform `SUPER_ADMIN` activates or renews the workspace by hand.

## Offer

Public catalog is loaded from `Plan` rows (`GET /api/plans`). Do not hardcode price, seats, or storage in the UI.

| Plan | Public price | Seats / storage | Visibility |
| --- | --- | --- | --- |
| Professional | `annualPriceCents` (launch: $499/year) | `maxUsers` / `maxStorageBytes` (launch: 10 / 20 GB) | `publiclyVisible` |
| Business | Contact sales (`contactSales`) | Configurable per plan | `publiclyVisible` |
| Starter | Hidden | Existing workspaces only | not public |

Optional Plan metadata: `displayPrice`, `currency`, `billingInterval`, `publiclyVisible`, `contactSales`, `sortOrder`. Changing public price is a Plan update, not a migration.

Trial policy (server constants, also returned on the catalog): 14 days, no card, 3-day trial grace. New organizations trial onto Professional features.

## Access

Authorization always uses **effective** status at request time. The daily reconciliation job is for reporting and emails only.

| Window | Effective status | Writes |
| --- | --- | --- |
| Trial days 1–14 | `TRIALING` | Allowed |
| Trial + 3-day grace | `GRACE` | Allowed, warning |
| After trial grace | `TRIAL_EXPIRED` | Read-only |
| Paid period | `ACTIVE` | Allowed |
| Paid + 7-day renewal grace | `PAID_GRACE` | Allowed, persistent expiry warning |
| After paid grace | `EXPIRED` | Read-only |
| Operator set | `SUSPENDED` / `CANCELLED` | Read-only |

Expired workspaces keep all operational data. People can sign in, read records, and open Plan & Subscription.

`daysUntilExpiration` is days until `trialEndsAt` (trial) or `currentPeriodEnd` (paid). Reminder thresholds: 30, 14, 7, 1 days.

## Tenant API

- `GET /api/organizations/:organizationId/subscription` — entitlement, usage, actions, open requests
- `GET /api/organizations/:organizationId/usage` — seats, storage, features summary
- `POST /api/organizations/:organizationId/activation-requests` — Owner/Admin, one `OPEN` ACTIVATION
- `POST /api/organizations/:organizationId/renewal-requests` — Owner/Admin, one `OPEN` RENEWAL
- `POST /api/organizations/:organizationId/plan-change-requests` — Owner/Admin, one `OPEN` PLAN_CHANGE

There is no Pay Now / checkout route. See `docs/entitlements.md` for limit enforcement.

## Platform API (`SUPER_ADMIN` only)

- `GET /api/platform/organizations`
- `GET /api/platform/plans`
- `GET /api/platform/commercial-requests`
- `PATCH /api/platform/commercial-requests/:id` — `CONTACTED` / `COMPLETED` / `CLOSED`
- `POST .../subscription/activate` — default period is start + 1 year
- `POST .../subscription/renew` — extends an in-term period by 1 year, or starts a new year
- `POST .../subscription/change-plan`
- `POST .../subscription/extend-trial` — `days` (7 / 14 / 30 / custom)
- `POST .../subscription/suspend|reactivate|cancel`

Tenant users receive 403 on platform routes.

## Requests

`ActivationRequest` stores `requestType`: `ACTIVATION` | `RENEWAL` | `PLAN_CHANGE`. Statuses: `OPEN` | `CONTACTED` | `COMPLETED` | `CLOSED`. Duplicate `OPEN` rows of the same type for one organization are rejected.

## Emails

`SubscriptionNotification` is the idempotent ledger (`organizationId` + `kind` + `periodKey`). Kinds include trial ending/expired, activation/renewal requested, activated/renewed, 30/14/7/1 renewal reminders, paid expiry, and workspace read-only.

Sales mail goes to `PLATFORM_SALES_EMAIL` (default `sales@fieldops.local`). Owner mail goes to active organization owners.

Daily cron `15 6 * * *` UTC runs reconciliation: persist effective statuses when safe, send due notifications, write `SUBSCRIPTION_EXPIRED` when a workspace becomes expired. Guards still recompute entitlement on every mutation.

## Audit

`TRIAL_STARTED`, `TRIAL_EXTENDED`, `ACTIVATION_REQUESTED`, `SUBSCRIPTION_ACTIVATED`, `RENEWAL_REQUESTED`, `SUBSCRIPTION_RENEWED`, `PLAN_CHANGED`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_SUSPENDED`, `SUBSCRIPTION_REACTIVATED`, `SUBSCRIPTION_CANCELLED`.

## Frontend

- `/pricing` and home/signup copy read the public catalog
- Settings → Plan & Subscription shows plan, status, price label, usage, trial/renewal dates, standard support, and state-based Request Activation / Request Renewal / Contact Support
- Persistent paid-grace banner uses the specified expiry copy
- `/platform` is the SUPER_ADMIN console

## Support

Professional includes standard support (usage, account, bugs, product issues, activation/renewal, updates). Custom development, integrations, workflows, reports, large migrations, and consulting are not included automatically.
