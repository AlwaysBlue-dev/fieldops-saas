# Organization role visibility

1. **Surfaces updated:** Organization Members names and role choices; team lists, team details, crew directory and member profiles; team supervisor pickers; add-member, skill assignment and certification-member selectors; Job Create supervisor/technician assignment pickers; Job Details assignment summaries; Jobs-list assignment summaries and technician filters; Schedule day/week technician resource rows, technician filters, and the shared scheduling/assignment drawer used from Schedule, Job Details and Jobs-list Actions; Reports technician filters; timesheet user selection and overtime request user selection.

   Existing supervisor/technician eligibility is unchanged. The schedule resource query still uses the TECHNICIAN-only eligibility predicate. Platform organization detail/contact screens were inspected: they already explicitly identify the person as Owner, resolved from that organization's Owner membership. Those explicit labels were preserved. No generic platform-wide user role was substituted. Welcome text, comments, activity, and created-by/updated-by displays were left alone.

2. **Shared display helpers:** `organizationRoleLabel` and `personOptionLabel` extend the existing person-label.ts helper. Labels are formatted from the supplied membership role: Owner, Admin, Operations Manager, Supervisor, Technician. Native dropdowns and string-based assignment summaries use `Name · Role`. `MemberRoleBadge` reuses the existing StatusPill component and muted FieldKeel styling. Existing crew/profile pills now use friendly role labels.

3. **Role resolution:** existing member, technician-directory, and team-member responses already derive role from OrganizationMember for the requested organization. Those values are reused. New display-only `organizationPersonSelect` loads only memberships matching the authenticated organization context for job assignees and team supervisors; `serializeOrganizationPerson` resolves against the job/team organization ID. Schedule resource metadata uses the selected OrganizationMember.role directly. Timesheet user options now expose the role already loaded by their organization-scoped membership query. No global/default User role is used, no role is inferred from team membership or assignment, and missing membership metadata produces no invented role badge.

4. **Files modified or added:** listed below. Changes are role display metadata, response typings, and presentation only; no permissions, eligibility, workflow, or mutation rules changed.

5. **Schema/migrations and verification:** no schema changes or migrations. No build, test, lint, Prisma, dev-server, validation, or deployment commands ran. Source and diffs were read only; runtime behavior remains for manual verification.

- `api/src/organizations/member-person.ts`
- `api/src/organizations/crew-serializer.ts`
- `api/src/organizations/jobs-serializer.ts`
- `api/src/organizations/jobs.service.ts`
- `api/src/organizations/schedule-serializer.ts`
- `api/src/organizations/schedule.service.ts`
- `api/src/organizations/teams.service.ts`
- `api/src/organizations/timesheets.service.ts`
- `web/src/components/fieldops/member-role-badge.tsx`
- `web/src/components/fieldops/job-detail-workspace.tsx`
- `web/src/components/fieldops/job-form-workspace.tsx`
- `web/src/components/fieldops/jobs-workspace.tsx`
- `web/src/components/fieldops/members-panel.tsx`
- `web/src/components/fieldops/reports-workspace.tsx`
- `web/src/components/fieldops/request-overtime-sheet.tsx`
- `web/src/components/fieldops/schedule-board.tsx`
- `web/src/components/fieldops/schedule-job-sheet.tsx`
- `web/src/components/fieldops/schedule-workspace.tsx`
- `web/src/components/fieldops/team-detail-workspace.tsx`
- `web/src/components/fieldops/team-form-sheet.tsx`
- `web/src/components/fieldops/teams-workspace.tsx`
- `web/src/components/fieldops/technician-profile-workspace.tsx`
- `web/src/components/fieldops/timesheet-workspace.tsx`
- `web/src/lib/jobs.ts`
- `web/src/lib/person-label.ts`
- `web/src/lib/schedule.ts`
- `web/src/lib/teams.ts`
- `web/src/lib/timesheets.ts`
- `docs/fieldkeel-role-visibility.md`
