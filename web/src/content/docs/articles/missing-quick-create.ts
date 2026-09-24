import type { DocArticle } from "../types";

export const missingQuickCreate: DocArticle = {
  slug: "missing-quick-create",
  title: "Missing Quick Create actions",
  description:
    "Quick Create shortcuts depend on role, active organization, and whether the subscription allows mutations.",
  categoryId: "troubleshooting",
  keywords: [
    "quick create missing",
    "new button",
    "permissions",
    "role",
  ],
  relatedSlugs: [
    "quick-create-overview",
    "roles",
    "workspace-readonly",
    "navigation-theme",
  ],
  sections: [
    {
      id: "role",
      heading: "Role and organization",
      paragraphs: [
        "Technicians see fewer create shortcuts than OWNER, ADMIN, or OPERATIONS_MANAGER. Confirm you are in the intended organization via the switcher — membership role is per organization, so elevated access in company A does not grant create options in company B.",
      ],
    },
    {
      id: "subscription",
      heading: "Read-only subscription",
      paragraphs: [
        "When the workspace is trial-expired, suspended, or cancelled, Quick Create actions disable with activation messaging. Request activation to restore creates. If only one shortcut is missing, it may be intentionally out of scope for your role rather than a global outage.",
      ],
    },
  ],
};
