# Notifications

In-app notifications and selective transactional email for FieldKeel.

## Model

`Notification` (existing):

- `organizationId` (nullable for platform-only later)
- `userId` recipient
- `type`, `title`, `body` (API exposes `message`)
- `relatedEntityType` / `relatedEntityId`
- `status` `UNREAD` | `READ`, `readAt`, `createdAt`
- `payload` JSON for navigation hints

## Central service

`NotificationsService` owns creates and inbox reads. Domain modules emit through thin hooks:

- `ApprovalNotificationHook` — job / timesheet approval lifecycle
- `OvertimeNotificationHook` — overtime request / decide
- `JobNotificationHook` — assign / reschedule (+ job-assigned email after commit)

Do not insert notification rows from controllers.

## Event types (in-app)

| Type | Source |
| --- | --- |
| `JOB_ASSIGNED` | Schedule assignment |
| `JOB_RESCHEDULED` | Schedule window change |
| `JOB_RETURNED` / `JOB_APPROVED` | Job approval |
| `TIMESHEET_SUBMITTED` / `TIMESHEET_APPROVED` / `TIMESHEET_RETURNED` | Timesheets |
| `OVERTIME_REQUESTED` / `OVERTIME_APPROVED` / `OVERTIME_REJECTED` | Overtime |
| `INVITATION` | Invite when invitee already has an account |
| `TRIAL_EXPIRING` / `TRIAL_GRACE` / `TRIAL_EXPIRED` | Subscription reconciliation |
| `ACTIVATION_REQUEST_ACK` | Activation request confirmation to requester |

Unread dedupe is applied for pending-style events (`dedupeUnread` on same type + entity).

## API

All scoped to active org membership of the current user:

- `GET /api/organizations/:organizationId/notifications`
- `GET /api/organizations/:organizationId/notifications/unread-count`
- `PATCH /api/organizations/:organizationId/notifications/:id/read`
- `PATCH /api/organizations/:organizationId/notifications/read-all`

Cross-tenant ids → **404**. Email failures never roll back domain transactions (mail runs after commit / caught in `MailService`).

## Email

`MailService` is the only sender entry point for business modules. It dispatches through a transport:

| `EMAIL_PROVIDER` | Transport |
| --- | --- |
| `smtp` / `mailpit` (default) | Nodemailer SMTP — local Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`) or any SMTP relay |
| `resend` | HTTP API (`RESEND_API_KEY`) — production transactional email |
| `none` | Skip sends (logged) |

Shared: `EMAIL_FROM`, optional `EMAIL_REPLY_TO`. Do not put API keys in source or docs.

Emailed (not every operational ping):

- Email verification (signup) — required before workspace creation
- Password reset
- Organization invitation
- Job assigned
- Job returned / approved
- Overtime decision
- Timesheet returned
- Trial ending / grace / expired
- Activation request acknowledgement

Tokens appear only in secure links, never in logs. Provider failures return `failed` without rolling back domain transactions.
