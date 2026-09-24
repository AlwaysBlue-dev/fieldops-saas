import type { DocArticle } from "../types";

export const reports: DocArticle = {
  slug: "reports",
  title: "Reports and exports",
  description:
    "Use summary KPIs, job-status and labour reports, the jobs table, CSV exports, and per-job PDFs — all computed server-side for your organization scope.",
  categoryId: "reports",
  keywords: [
    "reports",
    "summary",
    "labour",
    "CSV",
    "PDF",
    "job-status",
  ],
  relatedSlugs: [
    "jobs-overview",
    "time-gps",
    "approvals",
    "roles",
  ],
  sections: [
    {
      id: "summary",
      heading: "Summary KPIs",
      paragraphs: [
        "Reports open at `/app/[orgSlug]/reports`. The summary strip shows organization-timezone “today” metrics: jobs today, active jobs, completed today, pending approval, overdue, labour minutes (total / normal / overtime), completion rate, average recorded duration, technicians active today, and time entries requiring review.",
        "All aggregates are computed on the API against membership scope. The browser never aggregates raw job or time collections as a second source of truth.",
      ],
    },
    {
      id: "filtered",
      heading: "Job status, labour, and jobs table",
      paragraphs: [
        "Filtered reports share common filters (date range, client, site, team, technician, status, priority). Job-status counts jobs by status. Labour shows daily trend, type totals, and hours by technician, client, site, and job. The jobs report is a paginated table with labour minutes.",
        "Owner, admin, and operations manager see full organization scope. Supervisors see led teams and related assignments. Technicians see assigned jobs and own time only.",
      ],
    },
    {
      id: "exports",
      heading: "CSV exports and job PDF",
      paragraphs: [
        "Server-generated UTF-8 CSV exports (with BOM for Excel) cover jobs, timesheets, and labour. Exports honor the same org scope and filters. Cells that look like spreadsheet formulas are neutralized to reduce injection risk.",
        "Per-job PDF download builds a server-side Job Card PDF (not browser print) including org name, identity, client/site, schedule, crew, safety, work performed, materials, sign-off, signature image when available, photo count, labour, approval history, outcome, and generation timestamp. Expired or read-only subscriptions may still open reports and download CSV/PDF for historical read.",
      ],
    },
  ],
};
