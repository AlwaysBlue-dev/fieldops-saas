import type { DocArticle } from "../types";

export const approvals: DocArticle = {
  slug: "approvals",
  title: "Approvals inbox",
  description:
    "Review job completions, timesheets, and overtime requests in one Approvals inbox.",
  categoryId: "approvals",
  keywords: [
    "approvals",
    "job completion",
    "timesheet",
    "overtime",
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
        "The Approvals page is FieldKeel’s action center for three inbox types: Job completion, Timesheet, and Overtime. Each row opens the live job or time record — FieldKeel does not keep a separate copy of that work in the inbox.",
        "Day-to-day, work the three approval types above in Approvals.",
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
        "Timesheet cards show technician, date/week, hours, job linkage, validation status, and warnings. Blocked entries cannot be approved (they can be returned). Review shows warnings but still allows an authorized decision. Clear entries may be bulk-approved after FieldKeel re-checks each row.",
        "Overtime requests appear on the Overtime tab of the same page. Approve or reject; reject requires a comment. Decisions keep an audit trail and send in-app notifications with the update.",
      ],
    },
  ],
};
