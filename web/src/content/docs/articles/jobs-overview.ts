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
        "Soft-cancel jobs rather than deleting operational history. CANCELLED is a terminal-style status used when work will not complete; prior evidence and audit remain for the organization.",
      ],
    },
  ],
};
