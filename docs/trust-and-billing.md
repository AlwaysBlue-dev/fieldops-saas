# FieldKeel — Trust pages and manual billing

No payment gateway automation is connected in v1. Customers pay from a FieldKeel invoice using a secure payment link managed by platform administrators. Payment is verified before activation or renewal. External payment providers are an internal implementation detail and must not appear in customer-facing UI, emails, docs, FAQ, or policy.

These legal pages are product templates for counsel review, not legal advice. They do not claim SOC 2, ISO, HIPAA, insurance, or office/entity details unless those values are configured.

## Public routes

| Path | Purpose |
| --- | --- |
| `/trust` | Trust Center |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |
| `/security` | Current security practices + security contact |
| `/billing-policy` | Invoice process, verification, grace, retention |
| `/acceptable-use` | Acceptable Use |
| `/documentation` | Public documentation links |
| `/support` | Support / sales / security contacts |

`GET /api/trust` returns contact emails and document versions. It never includes private payment account details.

## Versions

`TERMS_VERSION`, `PRIVACY_VERSION`, `BILLING_POLICY_VERSION`, and `LEGAL_EFFECTIVE_DATE` are environment-configurable. Defaults: `2026-09-23`.

Signup requires `acceptTerms: true`. The API stores `termsAcceptedAt`, `termsVersion`, and `privacyVersion` on the user.

## Contacts

```
PLATFORM_SUPPORT_EMAIL=support@fieldkeel.com
PLATFORM_SALES_EMAIL=support@fieldkeel.com
SECURITY_CONTACT_EMAIL=support@fieldkeel.com
LEGAL_ENTITY_NAME=
LEGAL_GOVERNING_LAW=
```

Optional. Defaults (and the public website fallback) use `support@fieldkeel.com` as the single official FieldKeel contact mailbox for support, sales, security, and billing inquiries. Do not hardcode personal addresses in components.

```
EMAIL_FROM=FieldKeel <support@fieldkeel.com>
EMAIL_REPLY_TO=support@fieldkeel.com
```

## Invoices

`Invoice` numbers are allocated in a transaction as `FC-YYYY-000001`. Types: `ACTIVATION`, `RENEWAL`, `PLAN_CHANGE`, `OTHER`. Statuses: `DRAFT`, `PREPARING`, `ISSUED`, `PAYMENT_REPORTED`, `PAID`, `VOID`, `OVERDUE`.

Secure payment URL (`paymentUrl`, https only) and optional `externalReference` are platform-admin fields. Customers see Pay Invoice, never provider brand names.

Platform (`SUPER_ADMIN`):

- configure `PlatformBillingSettings` (optional notes; not public bank credentials)
- prepare invoice from Plan amount/currency/period (`PREPARING`)
- set secure payment URL / external reference
- issue (requires payment URL; emails customer)
- mark paid & activate / mark paid & renew (atomic)
- mark overdue / void

Customer OWNER/ADMIN:

- `/app/{org}/settings/billing`
- current plan, limits, current invoice, paginated history
- Pay Invoice (opens secure URL; does not change invoice/subscription state)
- I’ve Sent Payment → `PAYMENT_REPORTED` (never auto-activates)
- download PDF

## PDF

Server-generated PDF includes branding, invoice identity, bill-to, plan/period, totals, optional instructions, support contact, and the verification warning. Lookups are `{ id, organizationId }`. Customer-facing PDFs remain provider-neutral.

## Reminders

Daily subscription reconciliation sends idempotent trial and renewal reminders via `SubscriptionNotification` (`organizationId` + `kind` + `periodKey`).

## Anti-fraud copy

Use only the payment link in authenticated Billing or official FieldKeel communication. FieldKeel never asks for passwords, full card numbers, CVV, or auth codes by email, chat, or support message.
