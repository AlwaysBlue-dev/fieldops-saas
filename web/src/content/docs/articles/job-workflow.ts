import type { DocArticle } from "../types";

export const jobWorkflow: DocArticle = {
  slug: "job-workflow",
  title: "Job workflow and lifecycle",
  description:
    "How FieldKeel jobs move from draft through field execution and approval, including working days and role responsibilities.",
  categoryId: "jobs",
  keywords: [
    "workflow",
    "lifecycle",
    "status",
    "DRAFT",
    "SCHEDULED",
    "DISPATCHED",
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "COMPLETED",
    "RETURNED",
    "CANCELLED",
    "working days",
    "My Day",
    "approval",
  ],
  relatedSlugs: [
    "job-lifecycle",
    "jobs-overview",
    "approvals",
    "schedule-dispatch",
    "my-day",
    "roles",
  ],
  sections: [
    {
      id: "business-flow",
      heading: "End-to-end business flow",
      paragraphs: [
        "1. An authorized office user creates a job. It starts as DRAFT.",
        "2. The office prepares the job: client, site, title, description, and other details.",
        "3. Assign a technician and/or team, and set the schedule (start time, and finish when used).",
        "4. Schedule or release the job onto the board. It becomes SCHEDULED (and may move to DISPATCHED when the crew is expected to take the work).",
        "5. The assigned technician sees the job in My Day for the relevant day in the organization timezone.",
        "6. The technician starts travel / starts work according to the existing My Day and clock workflow. The job becomes IN_PROGRESS.",
        "7. During the visit the technician records work notes, materials, photos/files, safety acknowledgement when required, client representative details, signature when required, completion outcome, and completion notes.",
        "8. The technician submits for approval. The job becomes PENDING_APPROVAL.",
        "9. An authorized approver reviews evidence in Approvals.",
        "10. Approve moves the job to COMPLETED. Return sends it back (RETURNED) so the technician can correct and resubmit.",
      ],
    },
    {
      id: "statuses",
      heading: "Statuses in the product",
      paragraphs: [
        "FieldKeel uses these JobStatus values: DRAFT, SCHEDULED, DISPATCHED, IN_PROGRESS, PENDING_APPROVAL, COMPLETED, RETURNED, and CANCELLED. The API rejects illegal jumps between them.",
        "DRAFT is office preparation before the job is on the board. SCHEDULED places it on the schedule. DISPATCHED means the crew is expected to take the work. IN_PROGRESS is active field work. PENDING_APPROVAL means completion was submitted for review. COMPLETED is the terminal success state after an authorized approver accepts the work.",
      ],
    },
    {
      id: "happy-path",
      heading: "Primary status path",
      paragraphs: [
        "The usual forward path is DRAFT → SCHEDULED → DISPATCHED → IN_PROGRESS → PENDING_APPROVAL → COMPLETED.",
        "Scheduling a draft moves it to SCHEDULED when a start time is set. Clocking in or starting work on a DISPATCHED job advances it to IN_PROGRESS. Submitting completion evidence moves IN_PROGRESS to PENDING_APPROVAL.",
      ],
    },
    {
      id: "branches",
      heading: "RETURNED and CANCELLED",
      paragraphs: [
        "RETURNED is used when an approver rejects PENDING_APPROVAL with a comment. The crew fixes evidence or notes and resubmits (typically via IN_PROGRESS again toward PENDING_APPROVAL).",
        "CANCELLED stops work that will not finish. Cancelled jobs stay in history for reporting; they are not hard-deleted. Terminal statuses COMPLETED and CANCELLED do not continue the forward workflow.",
      ],
    },
    {
      id: "working-days",
      heading: "Working days and weekend scheduling",
      paragraphs: [
        "Organization Settings define the normal working week (for example Monday–Friday) in the organization timezone. Those days drive “today”, timesheets, and overtime boundaries.",
        "Jobs may still be scheduled on days outside the normal working week — emergency, weekend, after-hours, or special work. FieldKeel does not block those dates. When a dispatcher picks a date outside the configured week, the UI shows a clear confirmation (for example “Saturday is outside this organization's normal working week. Continue scheduling this job?”) with Cancel and Continue Anyway.",
        "Weekend or non-working-day jobs are not automatically marked as overtime. Overtime follows the existing overtime authorization rules separately.",
      ],
    },
    {
      id: "roles",
      heading: "Who does what",
      paragraphs: [
        "OWNER: organization ownership, subscription activation/renewal/plan changes, and full organizational control including settings and members.",
        "ADMIN: normal organization administration — working days, timezone, branding, users/members, clients, sites, and operational configuration. ADMIN does not perform Owner-only subscription or ownership actions.",
        "OPERATIONS_MANAGER: operational management of jobs, schedule, dispatch, and the approvals action center across the organization.",
        "SUPERVISOR: field/team supervision — scheduling and release where permitted, crew-scoped lists, and review of exceptions, timesheets, and incomplete job cards.",
        "TECHNICIAN: execute assigned work in My Day, record evidence, and submit completion for approval. Technicians do not manage org-wide membership, billing, or subscription.",
      ],
    },
  ],
};
