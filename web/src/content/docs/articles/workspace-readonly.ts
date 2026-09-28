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
        "New organizations that receive a trial use Professional for 14 days, then three grace days with writes still allowed. After grace, effective status is trial-expired and the workspace becomes read-only: you can sign in and read records, but not create jobs, clock, invite, upload, or approve.",
        "Additional workspaces created after your account has already used its free trial start needing activation (never activated). They are also read-only until the Owner activates a subscription. Operator-set SUSPENDED or CANCELLED states are read-only. Paid expiry after renewal grace behaves similarly. A persistent banner explains the state with Activate Workspace or Reactivate Workspace as appropriate.",
      ],
    },
    {
      id: "fix",
      heading: "How to restore mutations",
      paragraphs: [
        "Owners submit an activation (or renewal) request from the banner or Plan & Subscription. Never-activated workspaces use Activate Workspace; previously active or trial workspaces that expired use Reactivate Workspace. The control progresses through Request Sent → Invoice Being Prepared → Pay Invoice → Payment Awaiting Verification → Active. Complete payment from Billing when the invoice is ready.",
        "Until activation succeeds, treat the workspace as historical read — reports and CSV/PDF may still work for review, but field operations wait on commercial activation. Billing, invoices, Owner Inbox, documentation, and account areas stay available so you can restore service.",
      ],
    },
  ],
};
