import type { DocArticle } from "../types";

export const jobLifecycle: DocArticle = {
  slug: "job-lifecycle",
  title: "Job lifecycle and outcomes",
  description:
    "Jobs move Draft → Scheduled → Dispatched → In progress → Pending approval → Completed, with Returned and Cancelled branches, plus completion outcomes.",
  categoryId: "jobs",
  keywords: [
    "DRAFT",
    "SCHEDULED",
    "DISPATCHED",
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "COMPLETED",
    "RETURNED",
    "CANCELLED",
    "outcome",
  ],
  relatedSlugs: [
    "jobs-overview",
    "approvals",
    "job-execution",
    "schedule-dispatch",
  ],
  sections: [
    {
      id: "happy-path",
      heading: "Primary status path",
      paragraphs: [
        "FieldKeel prevents illegal status jumps. The primary path is Draft → Scheduled → Dispatched → In progress → Pending approval → Completed. Jumps such as Draft straight to Completed are blocked.",
        "Draft is office preparation. Scheduled places the work on the board. Dispatched means the crew is expected to take it. In progress usually follows field clock-in or start-of-work. Pending approval means the technician submitted completion for review. Completed is set when an authorized approver accepts the completion.",
      ],
    },
    {
      id: "branches",
      heading: "Returned and Cancelled",
      paragraphs: [
        "Returned sends work back from Pending approval when an approver rejects the completion with a required comment. The technician sees the reason on the job card, fixes evidence or notes, and can resubmit. Resubmit reuses the same approval inbox row rather than inventing a duplicate.",
        "Cancelled stops work that will not finish. Use it with a reason when appropriate. Cancelled jobs remain in history and reporting filters; they are not hard-deleted.",
      ],
    },
    {
      id: "outcomes",
      heading: "Completion outcomes",
      paragraphs: [
        "When completing or submitting work, capture an outcome that describes field reality: Completed, Partially completed, Follow-up required, or Unable to complete. Outcome is distinct from status — status is workflow position; outcome describes how the visit ended.",
        "Approvers review outcome alongside photos, signature, materials, safety, hours, and GPS clock evidence before moving Pending approval to Completed.",
      ],
    },
  ],
};
