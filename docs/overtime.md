# FieldKeel — Overtime authorization

Overtime time is not auto-approved. An `OvertimeAuthorization` must be requested and explicitly approved before it can cover a `TimeEntry` of type `OVERTIME`.

## Record

| Field | Role |
| --- | --- |
| organization / technician / job / workDate | Matching keys for a time entry |
| authorizedStart / authorizedEnd | UTC window the work must fall inside |
| maxMinutes | Hard cap across all linked entries |
| reason | Why overtime is needed |
| status | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |
| requestedBy / requestedAt | Who asked |
| decidedBy / decidedAt / decisionComment | Decision; comment required on reject |

Technicians may request when `OrganizationSettings.allowOvertimeRequests` is true (default). Operations or a supervisor may create a request for a visible technician. Requests are always created `PENDING`. No role auto-approves.

## Decision

Supervisor, operations manager, admin, or owner may approve or reject pending requests they are authorized to see. Rejection requires a comment. The requester, subject technician, or a manager may cancel a pending request.

## Timesheet integration

`OvertimeValidationService` is the only overtime policy owner. When `TimeEntry.type = OVERTIME` it requires an **approved** authorization that matches:

- organization
- technician
- job
- work date

and the entry must:

- fall entirely inside the authorized window
- be linked (`TimeEntry.overtimeAuthorizationId`)
- leave `usedMinutes + duration ≤ maxMinutes`

Used minutes include every counted linked entry (draft, pending, approved, returned). One authorization cannot be reused past its cap.

Timesheet validation returns **BLOCKED** with structured checks (`OVERTIME_UNAUTHORIZED`, `OVERTIME_WRONG_*`, `OVERTIME_OUTSIDE_WINDOW`, `OVERTIME_EXCEEDS_MAX`).

## API

```
GET    /api/organizations/:organizationId/overtime-authorizations
GET    /api/organizations/:organizationId/overtime-authorizations/:id
POST   /api/organizations/:organizationId/overtime-authorizations
POST   /api/organizations/:organizationId/overtime-authorizations/:id/decide
POST   /api/organizations/:organizationId/overtime-authorizations/:id/cancel
```

Writes require an active subscription. Wrong-tenant ids are **404**.

## UI

- Technician Time: **Request overtime**
- Supervisor / operations Approvals: overtime is a tab in the unified Approvals Center (jobs, timesheets, overtime). Mobile uses cards.

## Audit and notifications

Audit actions: `OVERTIME_REQUESTED`, `OVERTIME_APPROVED`, `OVERTIME_REJECTED`, `OVERTIME_CANCELLED`.

`OvertimeNotificationHook` emits matching domain events and writes in-app `Notification` rows for intended recipients. The notification module can subscribe to the same event types without changing overtime rules.
