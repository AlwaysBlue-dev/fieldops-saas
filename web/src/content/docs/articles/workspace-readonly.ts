import type { DocArticle } from "../types";

export const workspaceReadonly: DocArticle = {
  slug: "workspace-readonly",
  title: "Workspace is read-only",
  description:
    "Why create/edit/clock/approve controls disable after trial expiry, suspension, or cancellation — and how activation restores writes.",
  categoryId: "troubleshooting",
  keywords: [
    "read-only",
    "trial expired",
    "suspended",
    "activation",
    "grace",
  ],
  relatedSlugs: [
    "trial-onboarding",
    "billing-plans",
    "cannot-invite",
    "cannot-upload",
  ],
  sections: [
    {
      id: "why",
      heading: "Why writes stop",
      paragraphs: [
        "New organizations trial Professional for 14 days, then receive three grace days with writes still allowed. After grace, effective status is trial-expired and the workspace becomes read-only: you can sign in and read records, but not create jobs, clock, invite, upload, or approve.",
        "Operator-set SUSPENDED or CANCELLED states are also read-only. Paid expiry after renewal grace behaves similarly. A persistent banner explains the state; controls show that actions are available after account activation.",
      ],
    },
    {
      id: "fix",
      heading: "How to restore mutations",
      paragraphs: [
        "Owners and admins submit an activation (or renewal) request from Plan & Subscription. FieldOps arranges payment via manual invoice and a platform operator activates the plan. There is no Pay Now checkout in the product.",
        "Until activation succeeds, treat the workspace as historical read — reports and CSV/PDF may still work for review, but field operations wait on commercial activation.",
      ],
    },
  ],
};
