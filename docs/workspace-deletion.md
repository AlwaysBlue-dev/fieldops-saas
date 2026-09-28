# Workspace deletion

Owners manage deletion under Settings → Organization → Danger Zone, including in read-only workspaces. Other organization roles cannot use the deletion API. SUPER_ADMIN reviews requests under Platform → Workspace Deletion Requests.

## Commercial history
A trial alone is not commercial activation. The backend conservatively requires review when Subscription.activatedAt, paid-period dates, a paid lifecycle status (ACTIVE, PAID_GRACE, EXPIRED), a paid/verified invoice, or a historical activation/renewal/period/payment audit event exists. It does not rely on current entitlement or a frontend flag.

## Persistence and safety
Deletion is soft: Organization.deletedAt is set and status becomes DEACTIVATED; memberships become INACTIVE and pending invitations become REVOKED. Existing restrictive foreign keys, billing records, request history, Owner Inbox and audit records are retained. No account, trialUsedAt, or other workspace is deleted. There is no restore UI.

The deletion transaction locks the organization, rechecks the Owner and commercial history, and applies deletion and audit atomically. Review/cancel uses that same lock and rechecks PENDING state. A partial unique index enforces one pending request per workspace. Database triggers serialize Subscription/Invoice writes against this lock, reject billing writes to deleted workspaces and prevent reactivation of a tombstone. Concurrent transactions can fail and require retry; no successful direct deletion may race a committed activation.

Rejection reuses transactional OwnerMessage creation. Approval is retained in platform request/audit history; an organization-scoped approval notification would become inaccessible immediately, so none is sent.

## Storage and retention
S3 objects are not deleted. Their database references remain in the retained workspace. There is no existing tenant-wide purge workflow; implementing physical erasure and a retention schedule is separate work. UI confirmation explicitly describes access deletion and retained data, not permanent physical erasure.

## Deployment
Migration: 20260928190000_workspace_deletion. Apply it and regenerate the Prisma client using the project's normal deployment process before running the new code. Neither operation was run during implementation.

## Manual staging checklist
- Never-activated PENDING_ACTIVATION and trial-only workspaces: Owner confirmation deletes access directly.
- Paid ACTIVE and formerly paid EXPIRED: request required; no immediate deletion.
- Repeat request: one PENDING row; cancel preserves workspace; reject preserves workspace and delivers Owner Inbox message.
- Approve: confirmation, one successful transition, retained audit/request, all members lose access.
- Non-Owner deletion/status/request/cancel and non-SUPER_ADMIN review: 403.
- Read-only Owner can use Danger Zone.
- Competing activation/payment verification versus direct delete: either activation wins and deletion requires review, or deletion wins and billing write fails.
- Competing cancel/approve/reject: only one PENDING transition succeeds.
- Deleted selected workspace: immediate redirect for direct deletion; other open sessions detect lost membership on focus or within a minute while visible, clear selection and return through /app.
- Another workspace routes normally; zero memberships reaches Create Workspace.
- Deleted workspace cannot be reactivated by existing platform controls.
- Desktop/mobile/tablet/PWA, light/dark/system themes: dialogs, notes, status and pagination remain usable.

## Files changed

- api/prisma/schema.prisma
- api/prisma/migrations/20260928190000_workspace_deletion/migration.sql
- api/src/organizations/workspace-deletion.controller.ts
- api/src/organizations/workspace-deletion.service.ts
- api/src/organizations/organizations.module.ts
- api/src/notifications/notifications.service.ts
- api/src/platform/platform-subscription.service.ts
- api/src/subscription/subscription-reconciliation.service.ts
- api/src/billing/invoice.service.ts
- web/src/app/platform/layout.tsx
- web/src/app/platform/workspace-deletion-requests/page.tsx
- web/src/components/fieldops/workspace-danger-zone.tsx
- web/src/components/fieldops/settings-workspace.tsx
- web/src/components/fieldops/app-bootstrap.tsx
- web/src/components/fieldops/app-shell.tsx
- web/src/lib/workspace-deletion.ts
- web/src/lib/workspace-home.ts
- web/src/content/docs/articles/organization-settings.ts
- docs/workspace-deletion.md

Validation was limited to source/diff review. No tests, builds, lint, Prisma commands, Docker commands or dev servers were run. Database trigger behavior and application flows require manual staging verification.