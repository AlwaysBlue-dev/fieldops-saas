# Subscription lifecycle email audit and implementation

This is a source-only implementation. No build, tests, lint, Prisma generation, migration execution, development server, Railway command, or deployment was run. No email was sent during implementation.

## Before / after and exact triggers

All Owner lifecycle recipients below are the current organization's ACTIVE OWNER memberships. All such Owners are included individually, matching the existing multi-Owner model. Platform lifecycle recipients use PLATFORM_SALES_EMAIL with the existing configured fallback, never a list of SUPER_ADMIN accounts.

| Event | Before | After / exact trigger |
| --- | --- | --- |
| First eligible workspace trial | Trial dates and audit events were written; no trial welcome or platform lifecycle email | Successful workspace-creation transaction with trial eligibility and persisted trial start/end: Owner welcome and platform `New FieldKeel trial started`. Professional, 14 days from the existing constant, exact trial dates, no credit card, workspace CTA. Invitations do not call this hook. |
| Additional workspace | Stored NONE / effective PENDING_ACTIVATION and existing read-only UI; no creation lifecycle email | Successful additional-workspace creation: Owner activation/read-only notice and platform `New FieldKeel workspace awaiting activation`. Explicitly no additional trial. Existing onboarding/read-only behavior is unchanged. |
| Trial reminders | Owner reminders at remaining-day milestones 7, 3, 1, and due day, with incomplete dates/access details; due-day template could say one day | Preserve those milestones; include exact trial and grace end dates, current plan, manual billing, and Plan & Subscription CTA. Add platform `FieldKeel trial ending soon` at the 3-day milestone. Due-day messaging takes precedence over a redundant 1-day reminder on the same UTC date. |
| Trial grace starts | Owner grace email and in-app notification | Real reconciliation transition into GRACE: preserve Owner notice, clarify write access through the existing 3-day grace period, add platform grace-start notification. |
| Trial grace ending | Owner email and in-app notification with one grace day remaining | Preserve and include the exact grace end date. |
| Trial expires / read-only | Owner trial-expired email plus a second read-only email, with both in-app notices | Actual persisted transition into TRIAL_EXPIRED after grace: one Owner expiry/reactivation email and platform `FieldKeel trial expired`. Preserve the two existing in-app notices without a second equivalent email. Include actual trial end and grace end. |
| Initial commercial activation | Direct platform activation emailed active Owners; invoice activation emailed customerBillingEmail and notified Owners | Successful effective non-ACTIVE -> ACTIVE transition in direct activation, period-setting, or invoice-confirmed activation: Owner confirmation and platform `FieldKeel subscription activated`, with plan, effective date, period dates, workspace link and shared support footer. |
| Paid renewal | Direct platform renewal emailed Owners; invoice renewal emailed customerBillingEmail | Effective ACTIVE remains ACTIVE with changed paid period: Owner renewal confirmation and platform renewal confirmation. Repeating the same period/plan without a meaningful transition does not generate another lifecycle email. |
| Renewal reminders | Owner reminders at remaining-day milestones 30, 14, 7, 1, and due day | Preserve milestones using currentPeriodEnd; add platform `FieldKeel subscription renewal approaching` at 7 days. Owner content explains manual invoice payment and real grace dates; no automatic card-charge claims. |
| Paid renewal grace starts | Owner email labelled subscription expired when entering PAID_GRACE | Actual transition into PAID_GRACE: clarify that the paid period ended but write access continues through the existing 7-day grace period. Add platform grace-start notification. |
| Paid subscription expires | Owner read-only email after paid grace | Actual transition into EXPIRED: Owner expiry/reactivation email and platform `FieldKeel subscription expired`, with period end, grace end, read-only state and reactivation CTA. |
| Reactivation | Explicit platform reactivate had no email; activation/renewal paths used generic confirmations | Effective expired/suspended/cancelled access restored to ACTIVE: Owner and platform `FieldKeel workspace reactivated`, replacing an equivalent activation email. Explicit reactivate or trial extension restoring valid TRIALING/GRACE access also sends a confirmation with the actual trial status. A reactivate call that still evaluates expired/pending does not claim successful restoration. First activation from PENDING_ACTIVATION is labelled activation. |
| Actual plan change | Plan-change requests notified Sales and acknowledged in-app; actual assignment had no confirmation | A committed change in planId sends Owner and platform plan-change confirmation, unless included in the activation/renewal/reactivation confirmation for that same change. Unrelated updates do not send it. |
| Trial extension without restored access | Audit only | Unchanged. No new-trial email is generated by extending an existing trial. |
| Activation / renewal / plan-change requests | Sales emails already existed; activation email acknowledgement and activation/plan-change in-app acknowledgements existed | Existing Sales request emails now use the durable ledger and platform CTA. Owner activation acknowledgement uses current active Owners and persistent deduplication. |
| Other invoice events | Invoice-ready, payment-reported, payment-unconfirmed, voided, overdue and mark-paid-only emails; payment reports also emailed Sales | Existing invoice workflows remain. Invoice-confirmed activation/renewal joins the shared lifecycle queue. A separate receipt to a non-Owner invoice billing contact is preserved as the existing billing-recipient exception. When that billing contact is an Owner, the receipt is combined with their lifecycle confirmation. |

Platform lifecycle emails include workspace name, ID/slug, active Owner name/email, plan, actual status, relevant trial/paid dates, and WEB_URL/platform/organizations/{organizationId}. They contain no passwords, tokens, payment credentials, or API keys.

## Real events and scheduling

Creation, commercial transitions, and invoice-confirmed transitions enqueue inside the same database transaction as the business change. A rollback leaves no email to deliver. Subscription reconciliation locks and rereads the current subscription, evaluates the existing entitlement functions within that transaction, persists a real transition, and enqueues its notices atomically. GET requests and page visits do not enqueue emails.

The existing Nest ScheduleModule remains the scheduler:

- Existing subscription reconciliation: daily at 06:15 UTC. It evaluates both trial-ending and paid-renewal milestones from the existing date calculations.
- Subscription email delivery: every 5 minutes in that same scheduler/reconciliation service, up to 100 eligible delivery rows per pass. This also retries recoverable failures independently of lifecycle evaluation.
- Existing invoice-overdue scheduling is unchanged.

Keep the API process running continuously, including the 06:15 UTC reconciliation window; sleeping/stopped processes cannot run in-process schedules. No separate Railway cron service is required or configured. Existing multiple API replicas are protected by database locks, atomic insert/claim operations, and provider idempotency. Exact reminder milestones missed while the API is offline are not backfilled with misleading dates. Historical creation/expiry events from before rollout are not replayed; future reminders still use existing live subscription dates.

## Persistent deduplication and failure handling

The existing SubscriptionNotification ledger and its organizationId/kind/periodKey unique constraint are reused. A small schema extension was necessary: previously it only stored sent records, checked before network delivery and inserted afterward. That allowed concurrent duplicate sends and could not safely retain pending deliveries or recover a failed post-transition email.

New delivery rows store the rendered shared-template payload, delivery state, first attempt, claim lease, retry time and a non-sensitive failure summary. Existing rows remain SENT. Owner period keys include Owner user ID; platform copies have separate event kinds. A failed recipient therefore does not suppress successful delivery to another recipient. Legacy org-level sent markers continue to suppress already-delivered Owner milestones.

- Enqueue uses atomic createMany/skipDuplicates before any email request.
- Workers claim a row with a database compare-and-update and a five-minute lease; another worker cannot claim a live lease.
- Resend receives the stable `subscription/{ledger-row-id}` idempotency key and the exact stored message payload on every retry.
- Resend only retains keys for 24 hours. Automatic retry stops at 23 hours from the first attempt and moves the row to REVIEW, requiring provider-history inspection before any operator retry. See https://resend.com/docs/dashboard/emails/idempotency-keys.
- An uncertain SMTP attempt or a provider switch after an attempt also moves to REVIEW rather than risking duplicate delivery. SMTP does not offer the same provider deduplication guarantee.
- A skipped send (disabled/unconfigured provider) stays queued; it is never marked delivered.
- Pending Owner email is cancelled if its recipient is no longer an active Owner at that address. Deleted workspaces are cancelled. Unattempted reminder emails are cancelled if the subscription/date/milestone has been superseded.
- Errors log ledger and organization IDs, not payloads or secrets. Delivery runs after commit and cannot roll back or deactivate the subscription. Database enqueue failures remain ordinary transaction failures, so a business transition never commits without its durable event.

Operationally, inspect REVIEW rows and the existing provider dashboard before authorizing any retry. Never reset an ambiguous delivery blindly. The payload is retained so retry contents and provider idempotency remain stable.

## Owner notifications and Inbox

Existing lifecycle messages use NotificationsService.notify and the ordinary notification feed. Owner Inbox instead reads OwnerMessage records authored through the platform messaging feature. Those are intentionally separate.

No OwnerMessage/Inbox records, receipts, read/unread rules, or Inbox permissions changed. Existing lifecycle in-app notices are preserved, created transactionally and independently of email delivery, and protected by an IN_APP event marker plus the existing unread dedupe behavior. Reactivation and actual plan changes use the same notification channel. Notification links cover the relevant Plan & Subscription/Billing destinations. The redundant trial read-only email was removed while retaining its existing in-app notice.

## Branding and business rules

All queued messages use MailService.prepareText -> existing transactionalMailLayout -> existing MailTransport, including Resend. The shared layout supplies FieldKeel, the existing tagline, the absolute WEB_URL/icons/logo.png logo, and the existing support footer. Links use WEB_URL; sender/reply-to use EMAIL_FROM and EMAIL_REPLY_TO. Commercial copies use PLATFORM_SALES_EMAIL; support footer uses PLATFORM_SUPPORT_EMAIL, retaining existing fallback configuration.

No prices, trial duration, grace periods, entitlement calculations, payment behavior, or permission rules changed. Trial grace remains 3 days with writes; paid renewal grace remains 7 days with writes; read-only begins after the corresponding grace end. EntitlementService gained an optional transaction client so reconciliation reads the same committed-change context; its rules are unchanged.

## Manual rollout and limitations

Migration created, NOT executed: api/prisma/migrations/20260929120000_subscription_notification_delivery/migration.sql.

Apply that migration and regenerate the Prisma client in your normal manual rollout before running this source. The generated client was deliberately not regenerated here. Deploy migration and new application versions together; an old replica retains the old send-before-ledger behavior and must not remain running alongside new workers during rollout.

Configure the existing EMAIL_PROVIDER/RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, PLATFORM_SALES_EMAIL, PLATFORM_SUPPORT_EMAIL and WEB_URL for each environment. No new environment variable or Railway resource is required. Staging payloads use staging branding/links when its WEB_URL is configured accordingly. Do not copy queued mail payloads between production and staging.

All requested applicable future lifecycle events are implemented. Deliberate limits: no historic welcome/expiry backfill; no confirmation that falsely calls an expired/pending workspace reactivated; no automatic charging; no blind retries beyond provider deduplication protection. Validation and deployment remain for the user.

## Files modified or added

- api/prisma/schema.prisma
- api/prisma/migrations/20260929120000_subscription_notification_delivery/migration.sql (new, unexecuted)
- api/src/auth/auth.module.ts
- api/src/auth/auth.service.ts
- api/src/billing/invoice.service.ts
- api/src/mail/mail-transport.ts
- api/src/mail/mail.service.ts
- api/src/mail/resend-mail.transport.ts
- api/src/platform/platform-subscription.service.ts
- api/src/subscription/entitlement.service.ts
- api/src/subscription/subscription-access.service.ts
- api/src/subscription/subscription-delivery.service.ts (new)
- api/src/subscription/subscription-notification.service.ts
- api/src/subscription/subscription-notifications.module.ts (new)
- api/src/subscription/subscription-reconciliation.service.ts
- api/src/subscription/subscription.module.ts
- web/src/lib/notifications.ts
- docs/subscription-lifecycle-emails.md (this report)
