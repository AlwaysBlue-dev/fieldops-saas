import type { DocArticle } from "../types";

export const approvals: DocArticle = {
  slug: "approvals",
  title: "Approvals inbox",
  description:
    "The approvals action center covers JOB_COMPLETION, TIMESHEET, and OVERTIME only — each row points at the live domain record.",
  categoryId: "approvals",
  keywords: [
    "approvals",
    "JOB_COMPLETION",
    "TIMESHEET",
    "OVERTIME",
    "return",
    "approve",
  ],
  relatedSlugs: [
    "job-lifecycle",
    "time-gps",
    "job-execution",
    "roles",
  ],
  sections: [
    {
      id: "types",
      heading: "What appears in the inbox",
      paragraphs: [
        "The Approvals page is FieldKeel’s action center for three inbox types: JOB_COMPLETION, TIMESHEET, and OVERTIME. The UI does not copy jobs or timesheets into a separate store — each approval row points at the live domain record via subject type and id.",
        "Other historical enum values may exist in the schema for future use, but the product inbox you work day-to-day is these three types.",
      ],
    },
    {
      id: "job-completion",
      heading: "Job completion decisions",
      paragraphs: [
        "When a job is PENDING_APPROVAL, approvers review the full card: client/site, crew, completion, safety, materials, photos, representative, signature, hours, GPS clock evidence, and activity. Approve moves PENDING_APPROVAL → COMPLETED. Return moves PENDING_APPROVAL → RETURNED with a required comment.",
        "The backend refuses approve when the job is not PENDING_APPROVAL, required signature is missing, required safety is incomplete, a clock session is still open, a time record is incomplete, or GPS is required and clock evidence lacks coordinates.",
      ],
    },
    {
      id: "time-ot",
      heading: "Timesheets and overtime",
      paragraphs: [
        "Timesheet cards show technician, date/week, hours, job linkage, validation status, and warnings. BLOCKED entries cannot be approved (they can be returned). REVIEW shows warnings but still allows an authorized decision. CLEAR entries may be bulk-approved when the server re-validates each id.",
        "Overtime requests appear on the Overtime tab of the same page. Approve or reject; reject requires a comment. Decisions write audit events and in-app notifications in the same transaction as the domain update.",
      ],
    },
  ],
};
