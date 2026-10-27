import type { DocArticle } from "../types";

export const roles: DocArticle = {
  slug: "roles",
  title: "Organization roles",
  description:
    "Understand OWNER, ADMIN, OPERATIONS_MANAGER, SUPERVISOR, and TECHNICIAN — and why org role never lives on the User record.",
  categoryId: "organizations-members",
  keywords: [
    "OWNER",
    "ADMIN",
    "OPERATIONS_MANAGER",
    "SUPERVISOR",
    "TECHNICIAN",
    "permissions",
  ],
  relatedSlugs: [
    "members-invitations",
    "workspace-concept",
    "approvals",
    "my-day",
    "job-workflow",
  ],
  sections: [
    {
      id: "model",
      heading: "Where roles live",
      paragraphs: [
        "Organization permissions live on membership: Owner, Admin, Operations manager, Supervisor, or Technician. Selecting an organization in the UI does not grant access by itself — FieldKeel re-checks your active membership on every request.",
        "Because role is per membership, the same person can be Owner in one workspace and Technician in another without conflicting global roles.",
      ],
    },
    {
      id: "owner-admin",
      heading: "Owner and Admin",
      paragraphs: [
        "Owner runs the company commercially and operationally: billing, plan & usage, subscription activation/renewal, membership, settings, and full operational scope. Only the Owner can open Settings → Plan & Subscription, Plan & Usage, and Billing. Admin configures the organization — users, roles, clients, sites, and most settings (including the normal working week and branding) — with broad operational access, but without commercial ownership of the subscription.",
        "Both roles can manage members and organization profile settings. Admin cannot activate or renew the paid plan; that remains Owner-only. Both should be careful with last-owner protection when changing memberships.",
      ],
    },
    {
      id: "ops-supervisor",
      heading: "OPERATIONS_MANAGER and SUPERVISOR",
      paragraphs: [
        "OPERATIONS_MANAGER owns the board: jobs, schedule, dispatch, exceptions, and the approvals action center. Expect full-organization visibility for day-to-day dispatch work.",
        "SUPERVISOR owns a crew. Scope for reports and many lists focuses on led teams and assigned jobs / those technicians’ time. Supervisors review My Day exceptions, timesheets, overtime, incomplete cards, and missing photos or signatures.",
      ],
    },
    {
      id: "technician",
      heading: "TECHNICIAN",
      paragraphs: [
        "TECHNICIAN is the field role. Lists and reports typically show assigned jobs and own time only. The mobile shell emphasizes My Day, clock in/out, job execution evidence, and time. Technicians do not manage org-wide membership or billing.",
      ],
    },
  ],
};
