# FieldOps Cloud — Timesheets

Operational time is captured on the existing `TimeEntry` model. Clock In/Out still owns live `ClockSession` rows. Clock Out finalizes a `TimeEntry` in the same transaction. Manual time is a second, policy-gated source on the same model.

## Records

Each time entry is scoped to an organization and technician (`OrganizationMember` / `User`). Fields:

| Field | Role |
| --- | --- |
| `workDate` | Calendar date in the organization timezone |
| `startedAt` / `endedAt` | UTC instants |
| `durationMinutes` | Server-calculated only |
| `type` | `NORMAL`, `OVERTIME`, `TRAVEL`, `STANDBY` |
| `source` | Stored as `CLOCK_SESSION` or `MANUAL`. APIs present clock as `CLOCK` |
| `notes` | Work description (API `description`) |
| `status` | `DRAFT`, `PENDING` (also legacy `SUBMITTED`), `APPROVED`, `RETURNED`, `REJECTED` |
| `clockSessionId` | Unique. Makes clock conversion idempotent |
| `overtimeAuthorizationId` | Required when `type` is `OVERTIME`; must point at an approved grant |
| `validation` | Structured JSON `{ status, checks[] }`, not a free-text string |

Clock entries are created as `DRAFT`. Manual entries are created as `PENDING`.

## Authoritative duration

The API never accepts a client-supplied duration. Minutes are `round((endedAt - startedAt) / 60000)` on the server.

## Clock conversion

Clock Out continues to upsert `TimeEntry` by `clockSessionId`.

- Retries do not create a second row.
- A second Clock Out within two minutes of a successful close returns the existing closed session.
- Clock validation is stored; overlap on clock time is `REVIEW`, not a failed clock-out.

## Manual time

Gated by `OrganizationSettings.allowManualTime` (default off).

Required fields: Job, Date, Type, Start, Finish, Work Description.

Overtime requires an approved `OvertimeAuthorization` that matches organization, technician, job, and work date. See `docs/overtime.md`.

Technicians write their own time. Supervisors may write/read authorized team members. Owner / Admin / Operations Manager have org-wide operational time.

## Validation

`TimesheetValidationService` is the only policy owner. Controllers do not encode rules.

Result:

```json
{
  "status": "REVIEW",
  "checks": [
    {
      "code": "LONG_SHIFT",
      "severity": "WARNING",
      "message": "Total captured time exceeds configured normal daily hours."
    }
  ]
}
```

`CLEAR` — no findings.  
`REVIEW` — warnings only. The write is accepted.  
`BLOCKED` — at least one error. The write is rejected with `error: TIMESHEET_BLOCKED` and the same `validation` object.

Initial policies:

| Code | Default |
| --- | --- |
| `START_REQUIRED` / `FINISH_REQUIRED` | Block |
| `INVALID_RANGE` / `NEGATIVE_DURATION` | Block when finish ≤ start |
| `FUTURE_WORK_DATE` | Block manual dates after today in the org timezone |
| `MIN_DURATION` | Block manual entries under 15 minutes |
| `OVERLAP` | Block manual; review clock |
| `LONG_SHIFT` | Review when day total exceeds `defaultDailyHoursLimit` (8h) |
| `WEEKLY_LIMIT` | Review when week total exceeds `defaultWeeklyHoursLimit` (40h) |
| `MANUAL_DISABLED` | Block when `allowManualTime` is false |
| `MANUAL_DESCRIPTION` | Block if the description is not meaningful |
| `COMPLETED_JOB` | Block manual time on `COMPLETED` or `CANCELLED` jobs |
| `SCHEDULE_MISMATCH` | Review when work date ≠ job scheduled date |
| `OVERTIME_UNAUTHORIZED` / `OVERTIME_WRONG_*` / `OVERTIME_OUTSIDE_WINDOW` / `OVERTIME_EXCEEDS_MAX` | Block overtime that is missing or invalid |

Limits come from `OrganizationSettings` when present; otherwise the centralized 8h / 40h defaults apply.

## UI

`/app/[orgSlug]/time`

Desktop: previous / this / next week (next week is the farthest future week), employee context, daily totals, week total, normal / overtime / pending / approved, dense recent-entry table with validation status.

Mobile: This Week, weekday hours, total, recent cards, Add Time. No spreadsheet at phone width.

## Subscription

Expired or otherwise read-only entitlements can load the week view. Creates, edits, submit, and decisions require an active subscription.

## API

```
GET    /api/organizations/:organizationId/timesheets
GET    /api/organizations/:organizationId/timesheets/entries
GET    /api/organizations/:organizationId/timesheets/entries/:entryId
POST   /api/organizations/:organizationId/timesheets/entries
PATCH  /api/organizations/:organizationId/timesheets/entries/:entryId
POST   /api/organizations/:organizationId/timesheets/entries/:entryId/submit
POST   /api/organizations/:organizationId/timesheets/entries/:entryId/decide
```

Wrong-tenant identifiers return **404**. In-org forbidden actions return **403**.
