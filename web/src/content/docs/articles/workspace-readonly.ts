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
        "Additional workspaces created after your account has used its free trial start without a trial and remain read-only until a paid subscription is confirmed. Operator-set SUSPENDED or CANCELLED states are read-only. Paid expiry after renewal grace behaves similarly. A persistent banner links the Owner to Billing with Pay Now.",
      ],
    },
    {
      id: "fix",
      heading: "How to restore mutations",
      paragraphs: [
        "Owners open Billing from the banner or Settings and choose an available payment method for an issued invoice. Card payment is confirmed by Paddle; manual invoice payment requires I’ve Sent Payment and platform review. The workspace changes only after payment is confirmed.",
        "Until activation succeeds, treat the workspace as historical read — reports and CSV/PDF may still work for review, but field operations wait on commercial activation. Billing, invoices, Owner Inbox, documentation, and account areas stay available so you can restore service.",
      ],
    },
  ],
};
