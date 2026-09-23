# Reporting and exports

Operational reporting for FieldOps Cloud. All aggregates and exports are computed server-side against the active organization membership scope. The browser never aggregates raw job/time collections.

## Route

`/app/[orgSlug]/reports`

## Authorization

| Role | Scope |
| --- | --- |
| Owner / Admin / Operations manager | Full organization |
| Supervisor | Led teams + assigned jobs / those technicians’ time |
| Technician | Assigned jobs and own time only |

Expired / read-only subscriptions may still open reports and download CSV/PDF (historical read). Mutations elsewhere remain blocked by subscription guards; report endpoints do **not** use `@RequiresActiveSubscription`.

## Management KPIs

`GET /api/organizations/:organizationId/reports/summary`

Organization-timezone “today” boundaries via `zonedDayRange`:

- Jobs today, active jobs, completed today, pending approval, overdue
- Total / normal / overtime labour minutes today
- Completion rate (completed ÷ completed+cancelled for today)
- Average recorded job duration (time entries on jobs completed today)
- Technicians active today (open or clocked-in clock sessions)
- Time entries requiring review (`validation.status = REVIEW`)

## Filtered reports

Shared filters (`from`, `to`, `clientId`, `siteId`, `teamId`, `technicianUserId`, `status`, `priority`):

- `GET .../reports/job-status` — counts by `JobStatus`
- `GET .../reports/labour` — daily trend, type totals, hours by technician / client / site / job
- `GET .../reports/jobs` — paginated job table with labour minutes

Date filters use org timezone for schedule/completion windows. `TimeEntry.workDate` is compared as calendar dates.

## CSV exports

Server-generated UTF-8 CSV (BOM for Excel):

- `GET .../reports/exports/jobs.csv`
- `GET .../reports/exports/timesheets.csv`
- `GET .../reports/exports/labour.csv`

Exports honor the same org scope and filters. Cells beginning with `=`, `+`, `-`, or `@` are prefixed with `'` to prevent spreadsheet formula injection.

Caps: jobs 10k rows, timesheets 20k rows (paginate/filter for larger sets).

## Job Card PDF

`GET .../reports/jobs/:jobId/pdf`

Server-side PDFKit document (not browser print). Includes org name, job identity, client/site/address, WO, schedule, crew, safety, work performed, materials, client sign-off, signature image when available in object storage, photo count, labour, approval history, outcome, and generation timestamp.

Lookup is always `{ id, organizationId }` plus job visibility rules. Wrong-tenant or out-of-scope ids → **404**.

## Frontend

Summary strip (not a wall of identical cards), restrained Recharts bars for labour and status, labour tables, filter bar, CSV actions, and per-job PDF download.
