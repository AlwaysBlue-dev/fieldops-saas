import type { DocArticle } from "../types";

export const createAccountWorkspace: DocArticle = {
  slug: "create-account-workspace",
  title: "Create your account and workspace",
  description:
    "Register a user, verify your work email, create your first organization, and start your one-time 14-day Professional trial.",
  categoryId: "getting-started",
  keywords: [
    "register",
    "signup",
    "organization",
    "owner",
    "invite",
    "onboarding",
    "verify",
    "trial",
  ],
  relatedSlugs: [
    "verify-work-email",
    "trial-onboarding",
    "workspace-concept",
    "members-invitations",
    "roles",
    "forgot-password",
    "billing-plans",
  ],
  sections: [
    {
      id: "register",
      heading: "Create a FieldOps Cloud account",
      paragraphs: [
        "Start by registering with your work email and a password. Your account is a platform identity — email and credentials — and is separate from any organization you later join. Sessions use secure HTTP-only cookies. Tokens are never stored in localStorage or sessionStorage.",
        "After signup you must verify your work email before creating a trial workspace. See Verify your work email. If you already have an account and were invited to an organization, accept the invitation instead of creating a second account. Invitation acceptance can set a password when you are new to FieldOps Cloud and treats the invitation link as proof of email possession.",
      ],
    },
    {
      id: "create-org",
      heading: "Create your first workspace",
      paragraphs: [
        "After email verification, create your organization. That makes you its OWNER and starts your account’s one 14-day Professional free trial for that workspace. The organization is the tenant: clients, sites, jobs, files, timesheets, and subscription all belong to it. Choose a clear company name (you cannot create two workspaces you own with the same name, but other accounts may use the same display name).",
        "Timezone: FieldOps automatically suggests your current timezone, but you can change it during workspace setup or later in Organization Settings. The organization timezone drives “today,” schedule windows, timesheets, and overtime boundaries.",
        "Business type: During onboarding, choose the business type that best matches your organization. If it is not listed, select Other and enter your business type.",
        "You can belong to multiple organizations through membership. After login you pick an organization (or resume the last one). Switching organization reloads the workspace so data from company A never appears inside company B.",
      ],
    },
    {
      id: "additional-workspaces",
      heading: "Creating additional workspaces later",
      paragraphs: [
        "The same FieldOps account can own or join many organizations. Only the first self-created trial workspace receives the free trial. Additional workspaces you create require their own subscription (Starter, Professional, or Business) and use the normal request-activation / invoice flow. Joining someone else’s organization by invitation never uses your free trial.",
      ],
    },
    {
      id: "first-setup",
      heading: "First setup checklist",
      paragraphs: [
        "Complete onboarding basics: business type, timezone, and operating rules, then invite office staff and technicians with the correct organization roles (OWNER, ADMIN, OPERATIONS_MANAGER, SUPERVISOR, or TECHNICIAN). Soft-deactivate people who leave rather than deleting history.",
        "Add a few clients and sites before you create job cards so dispatch has somewhere to point. Create teams if you dispatch by crew. Technician-specific fields (employee code, trades, certifications, home team) live on the technician profile attached to membership — not on the global account.",
      ],
    },
  ],
};
