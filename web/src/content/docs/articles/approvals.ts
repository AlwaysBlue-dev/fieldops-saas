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
        "Day-to-day, work the three approval types above in Approvals."
      ],
    },
    {
      id: "job-completion",
      heading: "Job completion decisions",
      paragraphs: [
        "When a job is pending approval, approvers review the full card: client/site, crew, completion, safety, materials, photos, representative, signature, hours, GPS clock evidence, and activity. Approve moves the job to Completed. Return moves it to Returned with a required comment.",
        "Approve is blocked when the job is not waiting for approval, a required signature is missing, required safety is incomplete, a clock session is still open, a time record is incomplete, or GPS is required and clock evidence lacks coordinates.",
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
