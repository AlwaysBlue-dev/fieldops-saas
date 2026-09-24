import type { DocArticle } from "../types";

export const jobExecution: DocArticle = {
  slug: "job-execution",
  title: "Executing a job in the field",
  description:
    "Open the job card, capture work notes, materials, photos, safety, and client signature, then submit for approval.",
  categoryId: "job-execution",
  keywords: [
    "photos",
    "signature",
    "materials",
    "safety",
    "submit",
    "evidence",
  ],
  relatedSlugs: [
    "my-day",
    "job-lifecycle",
    "time-gps",
    "storage-overview",
    "approvals",
  ],
  sections: [
    {
      id: "on-site",
      heading: "On-site workflow",
      paragraphs: [
        "From My Day, open the assigned job, navigate to the site, and clock in according to company practice. While IN_PROGRESS, record work performed, materials used, and any safety checks your organization requires.",
        "Capture photos with the device camera when possible. Uploads count against the organization storage quota and per-file size limits. After submit or approval, evidence locks so casual deletion cannot erase the record.",
      ],
    },
    {
      id: "signoff",
      heading: "Client signature and completion rules",
      paragraphs: [
        "If the job or organization requires client sign-off, capture a touch signature before submit. The API blocks submit when required signature or required safety is missing. GPS-required organizations also need coordinates on clock evidence.",
        "Choose an accurate outcome (COMPLETED, PARTIALLY_COMPLETED, FOLLOW_UP_REQUIRED, or UNABLE_TO_COMPLETE) and submit. Status moves to PENDING_APPROVAL and a JOB_COMPLETION item appears in the approvals inbox.",
      ],
    },
    {
      id: "returned",
      heading: "If the job is returned",
      paragraphs: [
        "Approvers can return a job with a required comment. Fix the gaps called out — missing photo, incomplete materials, open clock session — then resubmit. The same approval row returns to PENDING.",
      ],
    },
  ],
};
