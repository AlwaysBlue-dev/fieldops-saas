import type { DocArticle } from "../types";

export const jobsOverview: DocArticle = {
  slug: "jobs-overview",
  title: "Jobs overview",
  description:
    "The job card is the system of record for a unit of field work: client, site, crew, schedule, evidence, and status.",
  categoryId: "jobs",
  keywords: [
    "jobs",
    "job card",
    "work order",
    "assignment",
    "priority",
  ],
  relatedSlugs: [
    "job-lifecycle",
    "job-execution",
    "schedule-dispatch",
    "clients-overview",
    "sites-access-notes",
  ],
  sections: [
    {
      id: "card",
      heading: "What a job card holds",
      paragraphs: [
        "Each job is organization-scoped with a job number from your organization’s numbering settings. The card ties together client, site, description, priority, status, scheduled window, and assignments to technicians and/or a team.",
        "Work logs, materials used, photos, documents, signatures, clock events, and GPS evidence on those clock events attach to the job. Reports and the approvals inbox read the live job record — they do not keep a separate copy of the card.",
      ],
    },
    {
      id: "access",
      heading: "Missing access info",
      paragraphs: [
        "Active jobs (not completed or cancelled) show Missing access info when the site’s Access notes are empty, or when both the site and the job lack a usable contact name/phone. FieldKeel calculates this on the server.",
        "You will see an amber badge on the Jobs list, a Missing access tab with a count, a warning on Job Details (with Add access info when you can edit the site), and a matching filter on Schedule. Saving site access notes and contacts clears the flag only after the server recalculates readiness. See Site access notes for the full rule.",
      ],
    },
    {
      id: "who-sees",
      heading: "Visibility by role",
      paragraphs: [
        "Owner, admin, and operations manager roles typically see organization-wide job lists. Supervisors focus on led teams and related assignments. Technicians see assigned jobs. Wrong-tenant or out-of-scope ids return not found.",
        "Creating jobs requires an active (or trial/grace) subscription that allows mutations. Read-only workspaces can still open historical jobs and exports.",
      ],
    },
    {
      id: "cancel",
      heading: "Cancel without destroying history",
      paragraphs: [
        "Soft-cancel jobs rather than deleting operational history. Cancelled is a terminal status used when work will not complete; prior evidence and audit remain for the organization.",
      ],
    },
  ],
};
