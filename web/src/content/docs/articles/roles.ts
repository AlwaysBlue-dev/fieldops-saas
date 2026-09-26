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
        "Platform roles on User are only USER and SUPER_ADMIN (internal operators). Organization permissions live exclusively on OrganizationMembership: OWNER, ADMIN, OPERATIONS_MANAGER, SUPERVISOR, or TECHNICIAN. Never treat a JWT claim or a UI-selected org as authority — membership is re-checked for every tenant request.",
        "Because role is per membership, the same person can be OWNER in one workspace and TECHNICIAN in another without conflicting global roles.",
      ],
    },
    {
      id: "owner-admin",
      heading: "OWNER and ADMIN",
      paragraphs: [
        "OWNER runs the company commercially and operationally: billing, plan & usage, subscription activation/renewal, membership, settings, and full operational scope. Only the OWNER can open Settings → Plan & Subscription, Plan & Usage, and Billing. ADMIN configures the organization — users, roles, clients, sites, and most settings (including the normal working week and branding) — with broad operational access, but without commercial ownership of the subscription.",
        "Both roles can manage members and organization profile settings. ADMIN cannot activate or renew the paid plan; that remains OWNER-only. Both should be careful with last-owner protection when changing memberships.",
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
