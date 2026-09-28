import type { DocArticle } from "../types";

export const workspaceConcept: DocArticle = {
  slug: "workspace-concept",
  title: "Organizations and workspaces",
  description:
    "An organization is the tenant boundary in FieldKeel. One account can own or join many workspaces; each has its own subscription.",
  categoryId: "organizations-members",
  keywords: [
    "organization",
    "workspace",
    "tenant",
    "membership",
    "multi-org",
    "isolation",
    "subscription",
  ],
  relatedSlugs: [
    "members-invitations",
    "roles",
    "create-account-workspace",
    "security-privacy",
    "billing-plans",
    "trial-onboarding",
  ],
  sections: [
    {
      id: "tenant",
      heading: "Organization as tenant",
      paragraphs: [
        "FieldKeel is multi-tenant from day one. An Organization is the commercial customer of FieldKeel and the isolation boundary for operational data. Clients, sites, teams, jobs, files, timesheets, approvals, reports, and subscription usage all live under one organization.",
        "Lookups are always scoped to the active organization. Wrong-tenant identifiers return not found rather than leaking existence across companies. Platform SUPER_ADMIN routes are separate and do not casually browse tenant jobs or files.",
      ],
    },
    {
      id: "membership",
      heading: "Accounts and membership",
      paragraphs: [
        "A FieldKeel account is a platform identity. Organization role is never stored on the account itself. Membership links an account to an organization with exactly one org role for that membership: OWNER, ADMIN, OPERATIONS_MANAGER, SUPERVISOR, or TECHNICIAN. Soft-deactivate memberships when people leave so history stays intact.",
        "Multi-organization membership is first-class. After login you select which organization to work in. Frontend org id or slug is selection only — authorization always reloads an active membership on the server.",
      ],
    },
    {
      id: "creating-a-workspace",
      heading: "Creating a workspace",
      paragraphs: [
        "Workspace names do not need to be globally unique. Different businesses may use the same organization name. However, you cannot create two workspaces you own with the same name.",
        "The workspace URL/identifier is generated automatically and remains unique, so two unrelated companies can both be called ABC Electrical without colliding in the product.",
      ],
    },
    {
      id: "multiple-workspaces",
      heading: "Additional workspaces",
      paragraphs: [
        "A FieldKeel account receives one eligible free trial. Owners may create additional workspaces immediately from Create workspace. Additional workspaces do not receive another free trial — they remain read-only until activated. The Owner can activate the workspace through Billing (Activate Workspace).",
        "One FieldKeel account can belong to many organizations and can also own multiple organizations. You can manage ABC Electrical and ABC Plumbing from the same FieldKeel account, but each workspace has its own plan, users, storage, and billing. Invited organizations do not consume your personal free-trial eligibility.",
        "FieldKeel may send account, billing, maintenance, or important service messages to Owners. Open Inbox even if a workspace is temporarily read-only.",
      ],
    },
    {
      id: "subscription-scope",
      heading: "Subscription and settings scope",
      paragraphs: [
        "Plan, trial dates, seat usage, and storage quota are organization-scoped. Settings such as timezone, evidence rules, and requireGps also belong to the organization. Changing organization in the switcher changes which subscription and settings apply — workspaces never share a pooled plan.",
      ],
    },
  ],
};
