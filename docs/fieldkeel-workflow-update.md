# FieldKeel role, job action, settings, and work-time update

Implementation report — 29 September 2026. Verification was limited to reading source and reviewing diffs. No tests, builds, lint, Prisma commands, migrations, dev servers, Railway commands, deployment commands, or database queries were run.

1. **Role bug root cause:** technician selection was sometimes based on crew/team membership rather than the organization role. Job Create explicitly requested both TECHNICIAN and SUPERVISOR. Scheduling used one mixed list for both supervisor and technician selectors.
2. **Incorrect data sources:** `TechniciansService.list` without a role filter intentionally returns the broad crew directory; operational selectors consumed that response as technicians. `ScheduleService.buildLanes` explicitly included supervisors and previously assigned users. Assignment validation in JobsService and ScheduleService checked only active membership.
3. **Corrected surfaces:** Schedule day/week technician lanes and technician filters; Schedule Job, edit/reschedule, and unassigned-job scheduling through ScheduleJobSheet; Job Create technician selection and team narrowing; Job Details scheduling/assignment; Jobs-list filters and action scheduling; Reports technician picker; My Day's assigned-job query. General crew directories and intentional all-team-member lists retain their broader membership behavior. Historical assignment records remain stored.
4. **Technician eligibility:** active OrganizationMember in the current organization with role TECHNICIAN, narrowed by selected team when filtering and by the caller's existing visibility scope. The shared backend predicate is `eligibleTechnicianWhere` in job-assignment.ts. Previous assignments, team membership alone, and supervisor selection cannot confer the role.
5. **Supervisor eligibility:** active member of the current organization with role OWNER, ADMIN, OPERATIONS_MANAGER, or SUPERVISOR. This preserves the existing Job Create supervisor selector's intended role set. TECHNICIAN is excluded.
6. **Backend rejection:** job creation, assignment updates, and schedule/assign endpoints use `requireJobAssignee`; non-technician IDs submitted as technicians are rejected. Teams are tenant-scoped and active. Existing supervisor restrictions to people on their visible teams remain. Managers' existing ability to assign technicians across teams is not replaced with a new compulsory team-membership rule; selected-team narrowing is applied to pickers and board resources. Existing invalid assignments are not automatically deleted; the scheduling UI requires an explicit removal choice for unavailable existing assignees.
7. **Jobs-list implementation:** Open remains readily accessible; an Actions button opens a responsive action drawer on desktop and mobile. The drawer fetches the current job card before showing actions.
8. **Shared components/endpoints:** the drawer renders the same PrimaryActions component used by Job Details, including its completion checklist and Return comment controls. Scheduling uses the existing ScheduleJobSheet and schedule API. Dispatch, start, submit, complete, return, resume, cancel, and clock APIs remain the existing operations. No alternate transition or notification implementation was created.
9. **Direct actions:** Schedule/assign or edit schedule/assignment; Dispatch; Start work; Clock in; Clock out; Submit for approval; Approve/complete; Return with comment; Resume; Cancel. Availability follows each job and user. Full job content remains available via Open.
10. **Visibility and refresh:** current server permissions, job status, assignment, current clock state, and the shared subscription MutationButton gate determine action availability. Self-approval is hidden consistently with the backend prohibition. Submission uses the current server blockers plus the existing completion-draft logic. Success refreshes through the existing DataRefreshProvider, including mounted notification loaders, preserving Jobs-list filters. No full-page reload is used.
11. **Notifications:** job-events.ts is unchanged. Actions use the existing services and notification hook; opening drawers and loading data do not emit events. The previous Draft schedule-notification fix remains intact.
12. **Required client signature:** already existed as OrganizationSettings.requireClientSignature; now editable using the existing settings API. Per-job requireClientSignOff continues to apply independently.
13. **Required GPS:** already existed as OrganizationSettings.requireGps; now editable using the existing settings API. Both clock directions still use ClockService.readGps.
14. **Normal Day Hours:** already existed as OrganizationSettings.defaultDailyHoursLimit, in hours. The UI uses the existing 1–24 validation range and decimal input. Existing timesheet calculations are unchanged. Settings controls initialize from and save the current organization's values, preserve dirty drafts during refresh, and display read-only values for other roles. OWNER/ADMIN editing and OWNER-only commercial settings remain unchanged.
15. **Start Work / Clock In relationship:** previously the standalone Start Work endpoint changed job status without a session, while Clock In already started a dispatched job. Start Work now delegates session creation to that existing ClockService operation. Resume shares the same path; clocking into a returned job resumes it through the existing allowed transition.
16. **Automatic clock creation:** yes, Start Work now creates the session and starts work together through ClockService, with the existing GPS requirement, timestamps, audit records, subscription guard, role/assignment checks, and open-session uniqueness constraint. A replay for a job already in progress with the caller's existing session does not create a second session. Clock-in against another open session remains rejected.
17. **Never-clocked-in check:** shared `workTimeBlockers` in job-work-time.ts requires a positive-duration CLOSED session for the submitting technician and job. For permitted non-technician submitters, it requires legitimate work evidence on the job. An approved positive-duration manual correction from the existing timesheet workflow is accepted as an alternative; no clock records are fabricated.
18. **Still-clocked-in check:** JobExecutionService.submit calls the shared work-time gate inside the submission transaction while holding the job lock. JobsService.get uses the same helper for checklist messages.
19. **All sessions checked:** every OPEN session in the current organization for that job blocks submission, not just the submitter's session. Clock In acquires the same job lock and rechecks status and assignment before creating a session, closing the clock-in/submission race.
20. **Nonparticipating assignees:** there is no requirement that every assigned technician have worked. An assigned person with no records does not block another technician who has valid work evidence. Any open session still blocks.
21. **Checklist messages:** “No work time has been recorded for this job. Clock in and complete your work session before submitting for approval.”; “You are still clocked in to this job. Clock out before submitting for approval.”; and “All technicians must clock out before this job can be submitted for approval.” Existing safety, completion, outcome, and signature messages remain. Job Details and Jobs-list actions provide explicit Clock Out and refresh eligibility afterwards.
22. **Clock Out GPS:** still enforced server-side by the existing readGps validation. Shared UI actions request location using the existing geolocation helper. Missing required GPS prevents clock-out; the open session therefore continues to block submission. Optional jobId on Clock Out protects job-specific actions from closing a session on a different job.
23. **Every approval entry point:** source inspection found JobExecutionService.submit as the writer of the transition to PENDING_APPROVAL. JobsController/JobsService and the UI submit client all delegate there. UpdateJobDto has no generic writable status field. The existing completion, safety, signature, and new work-time checks run together in the transaction. Submission never silently clocks anyone out.
24. **Manual correction:** an existing audited manual timesheet creation/update and approval workflow exists in TimesheetsService, governed by allowManualTime, subject visibility, validation, and approval rules. It is preserved; approved corrections can satisfy work evidence. No new correction workflow was introduced.
25. **Prisma schema changes:** none.
26. **Migrations:** none created or executed.
27. **Modified/new files:** listed below, including this report.
28. **Historical invalid assignments:** no database query was run, so no stored rows or counts are verified. The former broad validation could have admitted supervisors or other non-technicians. Those records require a separate data audit; none were automatically removed.
29. **PENDING_APPROVAL/COMPLETED jobs with open sessions:** not queried; existence and counts are unknown. The old submit path checked only the caller's clock, so other users' open sessions are a historical risk requiring review. The new gate prevents new submissions with open sessions.
30. **Jobs without work evidence:** not queried; existence and counts are unknown. The old Start Work/submission combination could permit this state. Historical records need manual review; this change does not invent work records or retroactively change job statuses.

## Files

- `api/src/organizations/clock.service.ts`
- `api/src/organizations/dto/clock-action.dto.ts`
- `api/src/organizations/dto/list-query.dto.ts`
- `api/src/organizations/job-assignment.ts`
- `api/src/organizations/job-execution.service.ts`
- `api/src/organizations/job-work-time.ts`
- `api/src/organizations/jobs.controller.ts`
- `api/src/organizations/jobs.service.ts`
- `api/src/organizations/my-day.service.ts`
- `api/src/organizations/schedule.service.ts`
- `api/src/organizations/technicians.service.ts`
- `web/src/app/app/[orgSlug]/settings/settings-organization-section.tsx`
- `web/src/components/fieldops/job-actions-drawer.tsx`
- `web/src/components/fieldops/job-detail-workspace.tsx`
- `web/src/components/fieldops/job-form-workspace.tsx`
- `web/src/components/fieldops/job-schedule-action.tsx`
- `web/src/components/fieldops/jobs-workspace.tsx`
- `web/src/components/fieldops/reports-workspace.tsx`
- `web/src/components/fieldops/schedule-job-sheet.tsx`
- `web/src/components/fieldops/schedule-workspace.tsx`
- `web/src/lib/job-clock.ts`
- `web/src/lib/jobs.ts`
- `web/src/lib/my-day.ts`
- `web/src/lib/teams.ts`
- `docs/fieldkeel-workflow-update.md`
