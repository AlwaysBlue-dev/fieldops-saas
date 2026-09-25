# Approvals Center

`/app/[orgSlug]/approvals` is the FieldKeel action center for:

- Job completion (`JOB_COMPLETION`)
- Timesheet entries (`TIMESHEET`)
- Overtime authorizations (`OVERTIME`)

The UI does **not** copy jobs or timesheets. Each approval row points at the live domain record (`subjectType` + `subjectId`).

## Approval record

`Approval` is the inbox row:

| Field | Role |
| --- | --- |
| `type` | `JOB_COMPLETION`, `TIMESHEET`, `OVERTIME` (also `TIME_ADJUSTMENT`, `SAFETY`) |
| `subjectType` / `subjectId` | Target entity |
| `status` | `PENDING`, `APPROVED`, `RETURNED`, `REJECTED`, `CANCELLED` |
| `requestedBy` / `requestedAt` | Who submitted the work |
| `assignedApprover` / `assignedRole` | Supervisor hint when the job has one |
| `decidedBy` / `decidedAt` / `decision` / `comment` | Outcome |

Unique `(organizationId, type, subjectId)` keeps retries from creating a second row. Resubmit after return resets the same row to `PENDING`.

## Job approval

Shown when the job is `PENDING_APPROVAL`. The card (and `GET /approvals/:id`) reuses the job card: client/site, crew, completion, safety, materials, photos, representative, signature, hours, GPS clock evidence, activity.

**Approve:** `PENDING_APPROVAL` → `COMPLETED`.  
**Return:** `PENDING_APPROVAL` → `RETURNED` with a required comment. The technician sees the reason on the job card.

Backend refuses approve when:

- the job is not `PENDING_APPROVAL`
- a required signature is missing
- required safety is incomplete
- a clock session is still open
- a time record is incomplete
- GPS is required and clock evidence is missing coordinates

## Timesheet approval

Card shows technician, date/week, hours, job, validation status, and warnings.

- `BLOCKED` cannot be approved. It can be returned.
- `REVIEW` shows warnings and still allows an authorized decision.
- `CLEAR` may be bulk-approved.

## Overtime

Pending overtime requests appear on the Overtime tab of the same page. Approve or reject (reject requires a comment). Existing `/overtime-authorizations/:id/decide` stays valid and writes the same `Approval` row.

## Bulk timesheet approve

`POST /organizations/:organizationId/approvals/bulk-timesheets` with `{ approvalIds }`.

The server reloads and checks **each** id:

- type is `TIMESHEET`
- status is still `PENDING`
- stored validation is `CLEAR`
- the entry is still pending
- the actor is in scope and is not the technician

Frontend checkboxes are never trusted.

## Transactions

Decide (and job complete/return, timesheet decide, overtime decide) in one transaction:

1. Update the approval
2. Update the job / time entry / overtime row
3. Write the audit action
4. Write in-app notifications

Optimistic `updateMany` on `PENDING` prevents a double decide from applying twice.

## Roles

| Actor | Rule |
| --- | --- |
| Technician | Cannot decide. Sees returned jobs and the return reason. |
| Supervisor | Only jobs/time/overtime in authorized teams. |
| Operations / Admin / Owner | Org-wide, still cannot approve their own operational records. |
| Platform `SUPER_ADMIN` | No silent tenant approval path. |

## API

- `GET /api/v1/organizations/:organizationId/approvals?type=&status=`
- `GET /api/v1/organizations/:organizationId/approvals/:approvalId`
- `POST /api/v1/organizations/:organizationId/approvals/:approvalId/decide`
- `POST /api/v1/organizations/:organizationId/approvals/bulk-timesheets`

Writes require an active subscription.

## Audit

`JOB_APPROVED`, `JOB_RETURNED`, `TIME_APPROVED`, `TIME_RETURNED`, `OVERTIME_APPROVED`, `OVERTIME_REJECTED`.
