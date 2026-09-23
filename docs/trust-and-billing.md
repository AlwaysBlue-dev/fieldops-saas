# FieldOps Cloud — Trust pages and manual billing

No payment gateway is connected. Customers pay from a FieldOps invoice. A platform administrator marks the invoice paid and then separately activates or renews the subscription.

These legal pages are product templates for counsel review, not legal advice. They do not claim SOC 2, ISO, HIPAA, insurance, or office/entity details unless those values are configured.

## Public routes

| Path | Purpose |
| --- | --- |
| `/trust` | Trust Center |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |
| `/security` | Current security practices + security contact |
| `/billing-policy` | Manual invoice process and grace rules |
| `/acceptable-use` | Acceptable Use |
| `/documentation` | Public documentation links |
| `/support` | Support / sales / security contacts |

`GET /api/trust` returns contact emails and document versions. It never includes bank or payment destination details.

## Versions

`TERMS_VERSION`, `PRIVACY_VERSION`, `BILLING_POLICY_VERSION`, and `LEGAL_EFFECTIVE_DATE` are environment-configurable. Defaults: `2026-09-23`.

Signup requires `acceptTerms: true`. The API stores `termsAcceptedAt`, `termsVersion`, and `privacyVersion` on the user.

## Contacts

```
PLATFORM_SUPPORT_EMAIL
PLATFORM_SALES_EMAIL
SECURITY_CONTACT_EMAIL
LEGAL_ENTITY_NAME
LEGAL_GOVERNING_LAW
```

Optional. Local defaults use `*.fieldops.local` for Mailpit. Do not hardcode personal addresses in components.

## Invoices

`Invoice` numbers are allocated in a transaction as `FC-YYYY-000001`. Types: `ACTIVATION`, `RENEWAL`, `PLAN_CHANGE`, `OTHER`. Statuses: `DRAFT`, `ISSUED`, `PAID`, `VOID`, `OVERDUE`. Issued invoices past due are persisted as `OVERDUE` once and emailed without bank details.

Platform (`SUPER_ADMIN`):

- configure `PlatformBillingSettings` (not public)
- create draft from Plan amount/currency/period
- issue (snapshots payment instructions, emails the customer to sign in)
- mark paid (does **not** activate)
- activate/renew from the paid invoice
- void

Customer OWNER/ADMIN:

- `/app/{org}/settings/billing`
- list/view invoices, download PDF
- see payment instructions only for issued/paid invoices
- report “I’ve Sent Payment” (`InvoicePaymentNotice`) — never auto-activates

## PDF

Server-generated PDF includes branding, invoice identity, bill-to, plan/period, totals, optional instructions, support contact, and the verification warning. Lookups are `{ id, organizationId }`.

## Anti-fraud copy

FieldOps never asks for passwords, full card numbers, CVV, or credentials by email, chat, or support message. Unexpected payment instructions must be verified with Support before anyone pays.
