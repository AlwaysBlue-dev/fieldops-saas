import type { DocArticle } from "../types";

export const trialOnboarding: DocArticle = {
  slug: "trial-onboarding",
  title: "Free Trial",
  description:
    "Each verified FieldKeel account is eligible for one 14-day Professional trial. No credit card required. Additional workspaces need their own subscription.",
  categoryId: "getting-started",
  keywords: [
    "trial",
    "grace",
    "professional",
    "activation",
    "read-only",
    "billing",
    "free trial",
  ],
  relatedSlugs: [
    "create-account-workspace",
    "billing-plans",
    "workspace-readonly",
    "organization-settings",
    "workspace-concept",
  ],
  sections: [
    {
      id: "eligibility",
      heading: "One free trial per verified account",
      paragraphs: [
        "Each verified FieldKeel account is eligible for one 14-day Professional trial. The trial begins when your first trial workspace is successfully created after email verification. No credit card is required.",
        "Accepting invitations to other organizations does not use your free trial. Creating additional workspaces after your first trial is allowed. Those workspaces do not receive another free trial — they open in read-only mode until you activate a subscription from Billing. Deleting a trial workspace does not restore free-trial eligibility.",
      ],
    },
    {
      id: "trial-window",
      heading: "What the trial includes",
      paragraphs: [
        "The free trial grants 14 days of access on the Professional plan entitlement — not Starter. During trial you can create jobs, invite members, clock in and out, upload evidence, and use approvals and reports within Professional limits (including Professional seat and storage quotas).",
        "The UI may show a quiet “days left in trial” banner. In the final three trial days the warning becomes stronger so owners know activation is approaching.",
      ],
    },
    {
      id: "grace",
      heading: "Three-day grace after trial",
      paragraphs: [
        "When the 14-day trial ends, the workspace enters a three-day grace window. Mutations remain allowed, but a non-blocking warning remains visible. Grace still uses Professional feature entitlement so you are not silently downgraded mid-grace.",
        "After grace ends, the effective status becomes trial-expired. People can still sign in and read jobs, clients, sites, timesheets, reports, and subscription screens. They cannot create or edit jobs, clock in/out, invite members, upload photos, create timesheets, or approve workflow records until the workspace is activated.",
      ],
    },
    {
      id: "activation",
      heading: "Request activation and manual invoice",
      paragraphs: [
        "There is no self-serve card checkout. Owners request activation from Plan & Subscription or the trial banner. After Request Activation, the control shows Request Sent, then Invoice Being Prepared, then Pay Invoice when Billing has the secure link. After I’ve Sent Payment, status is Payment Awaiting Verification until FieldKeel confirms payment and the subscription becomes Active.",
        "While read-only, create/edit controls show that the action is available after account activation. The API remains authoritative: even if a control were somehow enabled, expired or suspended workspaces reject mutations.",
        "Never-activated additional workspaces show Activate Workspace. Workspaces that previously had a trial or paid period and later expired show Reactivate Workspace. Both open the same Billing activation workflow.",
      ],
    },
    {
      id: "owner-inbox",
      heading: "Owner Inbox while read-only",
      paragraphs: [
        "FieldKeel may send account, billing, maintenance, or important service messages to organization owners. Open Inbox from the top bar or sidebar. Inbox stays available even when the workspace is temporarily read-only after trial expiry or before first activation.",
      ],
    },
  ],
};
