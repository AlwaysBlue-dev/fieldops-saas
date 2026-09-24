import type { DocArticle } from "../types";

export const jobLifecycle: DocArticle = {
  slug: "job-lifecycle",
  title: "Job lifecycle and outcomes",
  description:
    "Jobs move DRAFT → SCHEDULED → DISPATCHED → IN_PROGRESS → PENDING_APPROVAL → COMPLETED, with RETURNED and CANCELLED branches, plus completion outcomes.",
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
        "The API enforces legal transitions. The primary path is DRAFT → SCHEDULED → DISPATCHED → IN_PROGRESS → PENDING_APPROVAL → COMPLETED. Illegal jumps (for example DRAFT straight to COMPLETED) are rejected.",
        "DRAFT is office preparation. SCHEDULED places the work on the board. DISPATCHED means the crew is expected to take it. IN_PROGRESS usually follows field clock-in or start-of-work. PENDING_APPROVAL means the technician submitted completion for review. COMPLETED is set when an authorized approver accepts the completion.",
      ],
    },
    {
      id: "branches",
      heading: "RETURNED and CANCELLED",
      paragraphs: [
        "RETURNED sends work back from PENDING_APPROVAL when an approver rejects the completion with a required comment. The technician sees the reason on the job card, fixes evidence or notes, and can resubmit. Resubmit reuses the same approval inbox row rather than inventing a duplicate.",
        "CANCELLED stops work that will not finish. Use it with a reason when appropriate. Cancelled jobs remain in history and reporting filters; they are not hard-deleted.",
      ],
    },
    {
      id: "outcomes",
      heading: "Completion outcomes",
      paragraphs: [
        "When completing or submitting work, capture an outcome that describes field reality: COMPLETED, PARTIALLY_COMPLETED, FOLLOW_UP_REQUIRED, or UNABLE_TO_COMPLETE. Outcome is distinct from status — status is workflow position; outcome describes how the visit ended.",
        "Approvers review outcome alongside photos, signature, materials, safety, hours, and GPS clock evidence before moving PENDING_APPROVAL to COMPLETED.",
      ],
    },
  ],
};
