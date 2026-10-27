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
      id: "notifications",
      heading: "Job notifications and emails",
      paragraphs: [
        "Newly assigned technicians and the assigned supervisor receive a notification and email, including when a draft job is still being prepared. Assign technicians explicitly: selecting a team alone does not grant technician access to a job.",
        "Initial scheduling, schedule changes, and dispatch notify assigned technicians and the assigned supervisor. Technicians also receive email for these events. Starting work or clocking into a dispatched job notifies the assigned supervisor in the app.",
        "Submitting for approval notifies and emails the assigned supervisor. If no supervisor is assigned, eligible Owner, Admin, and Operations Manager reviewers receive the request. Returning a job notifies and emails its technicians with review comments. Approval notifies technicians in the app only.",
        "Alerts exclude the person performing the action. Saving unchanged assignments or editing unrelated details does not repeat assignment alerts. Notification links open the job within your existing access permissions.",
      ],
    },
    {
      id: "business-flow",
      heading: "End-to-end business flow",
      paragraphs: [
        "1. An authorized office user creates a job. It starts as DRAFT.",
        "2. The office prepares the job: client, site, title, description, and other details.",
        "3. Assign a technician and/or team, and set the schedule (start time, and finish when used).",
        "4. Schedule or release the job onto the board. It becomes Scheduled (and may move to Dispatched when the crew is expected to take the work).",
        "5. The assigned technician sees the job in My Day for the relevant day in the organization timezone.",
        "6. The technician starts travel / starts work according to the existing My Day and clock workflow. The job becomes In progress.",
        "7. During the visit the technician records work notes, materials, photos/files, safety acknowledgement when required, client representative details, signature when required, completion outcome, and completion notes.",
        "8. The technician submits for approval. The job becomes Pending approval.",
        "9. An authorized approver reviews evidence in Approvals.",
        "10. Approve moves the job to Completed. Return sends it back (Returned) so the technician can correct and resubmit.",
      ],
    },
    {
      id: "statuses",
      heading: "Statuses in the product",
      paragraphs: [
        "Jobs move through these statuses: Draft, Scheduled, Dispatched, In progress, Pending approval, Completed, Returned, and Cancelled. FieldKeel prevents illegal jumps between them.",
        "Draft is office preparation before the job is on the board. Scheduled places it on the schedule. Dispatched means the crew is expected to take the work. In progress is active field work. Pending approval means completion was submitted for review. Completed is the terminal success state after an authorized approver accepts the work.",
      ],
    },
    {
      id: "happy-path",
      heading: "Primary status path",
      paragraphs: [
        "The usual forward path is Draft → Scheduled → Dispatched → In progress → Pending approval → Completed.",
        "Scheduling a draft moves it to Scheduled when a start time is set. Clocking in or starting work on a Dispatched job advances it to In progress. Submitting completion evidence moves In progress to Pending approval.",
      ],
    },
    {
      id: "branches",
      heading: "Returned and Cancelled",
      paragraphs: [
        "Returned is used when an approver rejects Pending approval with a comment. The crew fixes evidence or notes and resubmits (typically via In progress again toward Pending approval).",
        "Cancelled stops work that will not finish. Cancelled jobs stay in history for reporting; they are not hard-deleted. Terminal statuses Completed and Cancelled do not continue the forward workflow.",
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
