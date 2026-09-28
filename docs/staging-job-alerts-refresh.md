# Job alerts and Refresh Data — implementation report

## Existing coverage and root cause

The main JobsService create/update, dispatch and work-start paths did not call JobNotificationHook. ScheduleService alone generated technician assignment/reschedule notifications and assignment email. Supervisor assignment and initial scheduling had no notification coverage. Submission had an in-app supervisor notice but no email. Approval/return emitted notices and sent email to the crew, including supervisors; approval email was noisier than the requested policy.

The notification drawer also derived a badge from its loaded page, not the total unread count. Its Mark All Read button used the operational mutation guard. These are corrected. Notification pagination now forwards page/pageSize to the existing service.

## Event delivery

| Persisted event | In-app recipients | Email recipients |
| --- | --- | --- |
| New technician assignment, including Draft | Newly assigned technicians | Same |
| New supervisor assignment, including Draft | Assigned supervisor | Same |
| Initial schedule | Assigned technicians and supervisor | Technicians |
| Reschedule, finish-time change, or cleared schedule | Assigned technicians and supervisor | Technicians |
| Transition to existing DISPATCHED | Assigned technicians and supervisor | Technicians |
| DISPATCHED → IN_PROGRESS, via Start or clock-in | Assigned supervisor | None |
| Submit for approval | Eligible assigned supervisor; otherwise eligible Owner/Admin/Operations Manager reviewers | Same |
| Returned for updates | Assigned technicians, with review comment | Same |
| Approved/completed | Assigned technicians | None |

Actors are excluded. Active membership and job visibility constrain recipients. Multiple technician assignments are deduplicated. Team selection does not expand technician job access in the current model: explicit JobAssignment rows determine technicians. Existing behavior does not send removal alerts to former assignees, and that remains unchanged. Supervisor assignment changes notify only the new supervisor, not every Supervisor in the workspace.

A user assigned in both roles receives one assignment alert. Different business events (for example assignment and initial scheduling in one create) can each produce an alert.

## Backend and email

JobNotificationHook compares before/after database snapshots under the Job row lock. Existing status compare-and-set checks remain; concurrent edits also reject stale updatedAt values. Notification rows are written in the same transaction as the business event. Unchanged assignments/times, unrelated edits, GETs, rendering, and refresh actions do not create alerts.

The same hook is connected to create/edit, ScheduleService, dispatch/start, clock-in, submit, return, and approval. Approval records and RBAC remain in their existing services.

MailService.sendJobWorkflow reuses transactionalMailLayout, its full FieldKeel logo, configured sender/reply-to, and APP_URL for role-aware job detail links. Email runs after commit and delivery failures are caught/logged rather than failing the job mutation. This remains best-effort delivery without a durable outbox/retry queue; no new database model was added.

## Refresh architecture and behavior

The application uses Next App Router with component-local state and custom apiRequest loaders, not a shared React Query/SWR cache. Refresh calls registered loaders on mounted components; it does not call location.reload, change URL, or remount the shell/page. router.refresh alone would leave this local API state unchanged.

DataRefreshProvider coordinates the existing loaders and loading state; it is not a second server-data cache. Identical GETs in one explicit refresh are coalesced through apiRequest, and the batch is discarded afterward. Successful concurrent mutations invalidate earlier batched results. Only active mounted loaders run.

Coverage includes:
- Overview's existing workspace/account information
- Jobs, job detail, file metadata, Schedule, My Day
- Clients, client detail, Sites, Teams, team detail, technician profile
- Approvals and expanded review detail, Timesheets, Reports
- Billing and selected invoice, Plan/Usage, Storage, Members
- Organization settings, preserving a dirty draft rather than replacing it
- Inbox list/selected message, Notifications page, open notification drawer
- Shared user/membership state, entitlement/subscription and both unread counts

Page state is retained: filters, tabs, pagination, review selection, editable fields and open forms are not reset by remounting. New-job drafts remain local while shared workspace data refreshes. Organization settings refresh does not overwrite a dirty draft or input typed during the request.

Overview currently renders placeholder KPI/trend content; there is no live KPI endpoint to refresh. This task does not invent dashboard metrics.

The accessible circular-arrow button uses the existing icon/button styles, spins while running, and prevents repeated clicks. On narrow mobile screens it is in the account menu to avoid header crowding. It works with browser and installed PWA layouts and theme tokens.

Failed loaders retain displayed data and produce the existing Sonner error toast. Other successful loaders still update. apiRequest continues to renew access tokens using the existing refresh session; only genuine SessionExpiredError follows the existing login flow.

## Notification counts and read-only access

Read/read-all/unread success emits an organization-scoped change event, refreshing the shell's canonical unread count. The drawer no longer calculates the total from a partial page. Notification unread count also refreshes every 60 seconds while visible, when opening the drawer, and through Refresh Data. No real-time push channel was added.

Inbox keeps its existing change-event behavior and gains manual refresh coverage. All desktop/mobile views consume the shell counts. Normal notification read/unread/read-all actions use the existing Notification.status model and have no active-subscription requirement. Owner Inbox remains Owner-only. Operational mutation guards remain intact.

## Documentation

Customer help articles updated: navigation-theme and job-workflow.
Existing engineering guide updated: docs/notifications.md.

## Validation and database

Source and diff review only. No tests, builds, lint, dev servers, Docker, Prisma migration or generation commands were run. No Prisma schema changes or migration files.

## Manual staging checklist

1. Create a Draft job with one or several technicians and a supervisor. Confirm each new recipient gets assignment in-app/email, with Draft preparation wording. Confirm actor exclusion.
2. Save the same assignments or edit notes/title. Confirm no assignment alert repeats. Reassign to another technician/supervisor and confirm only new assignees receive assignment alerts.
3. Add an initial schedule, change the start, change only the finish, and clear the schedule. Confirm technician in-app/email and supervisor in-app alerts; confirm organization timezone/context.
4. Dispatch the job. Confirm technician in-app/email and supervisor in-app.
5. Start from the job view, then separately clock into another DISPATCHED job from My Day. Confirm one supervisor in-app notice, no technician self-notice or work-start email.
6. Submit valid evidence. Confirm assigned eligible reviewer in-app/email and working Review Job link. Repeat without a supervisor to verify eligible manager fallback.
7. Return with comments, resume/resubmit, and approve. Confirm technician return in-app/email, then approval in-app only.
8. Try simultaneous/repeated mutation requests. Confirm failed/repeated transitions do not create duplicate alerts. Fetching/refreshing must never create alerts.
9. Simulate mail delivery failure. Confirm the job change and in-app alert still commit.
10. Verify cross-tenant IDs are rejected and users receive only their own notifications. Confirm links work for technicians/supervisors and access is not broadened.
11. Open/read, mark unread, and Mark All Read; confirm total badges update even with multiple notification pages. Repeat in an expired/read-only workspace.
12. From another session change data on each supported screen, then Refresh Data. Confirm current data, current URL/tab/filter/page, subscription state, and counts without a full browser reload.
13. Type unsaved input in job evidence, new-job, billing and organization settings forms. Refresh and confirm input remains; also type while a refresh is pending.
14. Open the notification drawer and load more pages; refresh while keeping its context and verify the total badge.
15. Test network failure and recovery, rapid repeated clicks, valid refresh-token renewal, and genuine session expiry.
16. Check desktop, narrow mobile, tablet, installed PWA, keyboard labels/focus, and Light/Dark/System themes.

## Files changed

- api/src/mail/mail.service.ts
- api/src/notifications/notifications.controller.ts
- api/src/notifications/notifications.service.ts
- api/src/organizations/clock.service.ts
- api/src/organizations/job-events.ts
- api/src/organizations/job-execution.service.ts
- api/src/organizations/jobs.service.ts
- api/src/organizations/schedule.service.ts
- docs/notifications.md
- web/src/app/app/[orgSlug]/settings/billing/billing-workspace.tsx
- web/src/app/app/[orgSlug]/settings/plan-usage/plan-usage-workspace.tsx
- web/src/app/app/[orgSlug]/settings/settings-organization-section.tsx
- web/src/app/app/[orgSlug]/settings/storage/storage-workspace.tsx
- web/src/components/fieldops/app-shell.tsx
- web/src/components/fieldops/approvals-workspace.tsx
- web/src/components/fieldops/client-detail-workspace.tsx
- web/src/components/fieldops/clients-workspace.tsx
- web/src/components/fieldops/data-refresh-provider.tsx
- web/src/components/fieldops/job-detail-workspace.tsx
- web/src/components/fieldops/job-files-panel.tsx
- web/src/components/fieldops/jobs-workspace.tsx
- web/src/components/fieldops/members-panel.tsx
- web/src/components/fieldops/my-day-workspace.tsx
- web/src/components/fieldops/notification-center.tsx
- web/src/components/fieldops/notification-inbox.tsx
- web/src/components/fieldops/overview-board.tsx
- web/src/components/fieldops/owner-inbox-workspace.tsx
- web/src/components/fieldops/reports-workspace.tsx
- web/src/components/fieldops/schedule-workspace.tsx
- web/src/components/fieldops/sites-workspace.tsx
- web/src/components/fieldops/subscription-provider.tsx
- web/src/components/fieldops/team-detail-workspace.tsx
- web/src/components/fieldops/teams-workspace.tsx
- web/src/components/fieldops/technician-profile-workspace.tsx
- web/src/components/fieldops/timesheet-workspace.tsx
- web/src/components/fieldops/top-bar.tsx
- web/src/content/docs/articles/job-workflow.ts
- web/src/content/docs/articles/navigation-theme.ts
- web/src/lib/api.ts
- web/src/lib/notifications.ts
- docs/staging-job-alerts-refresh.md (this report)
