import type { DocArticle } from "../types";

export const aiWorkforceRolesAccess: DocArticle = {
  slug: "ai-workforce-roles-access",
  title: "Who can use AI Workforce",
  description:
    "Owner, Admin, Operations manager, and Supervisor can use AI Workforce when the plan includes it. Technicians are not included. Data stays within your organization and role visibility.",
  categoryId: "ai-workforce",
  keywords: [
    "roles",
    "Owner",
    "Admin",
    "Operations manager",
    "Supervisor",
    "Technician",
    "permissions",
    "tenant",
    "visibility",
  ],
  relatedSlugs: [
    "ai-workforce-overview",
    "ai-workforce-limits-safety",
    "roles",
    "workspace-concept",
    "security-privacy",
  ],
  sections: [
    {
      id: "roles",
      heading: "Roles that can open AI Workforce",
      paragraphs: [
        "When your organization’s plan includes AI Workforce and the subscription allows product use, these organization roles can open and use it: Owner, Admin, Operations manager, and Supervisor.",
        "Technician memberships do not currently include AI Workforce in navigation or access. Technicians continue to use My Day, jobs, and time as usual.",
      ],
    },
    {
      id: "entitlement",
      heading: "Plan and subscription still apply",
      paragraphs: [
        "Having an eligible role is not enough on Starter, or when AI Workforce is turned off for the plan. FieldKeel also checks that AI Workforce is included on the effective plan and that the workspace is not stuck in a read-only commercial state that blocks normal use.",
      ],
    },
    {
      id: "visibility",
      heading: "Same visibility as the rest of FieldKeel",
      paragraphs: [
        "Lookups run as the signed-in member. Supervisors still see crew-scoped operational data according to existing FieldKeel rules; they do not receive a hidden organization-wide dump through AI.",
        "Job lists, schedule views, and missing-access results respect the same authorization as the corresponding product screens.",
      ],
    },
    {
      id: "tenancy",
      heading: "No cross-organization access",
      paragraphs: [
        "AI Workforce cannot be used to read another organization’s jobs, schedules, or files. Switching the workspace in the UI only selects which membership FieldKeel authorizes next — it does not merge tenants.",
        "For how sessions and isolation work generally, see Security and privacy and Organization roles.",
      ],
    },
  ],
};
