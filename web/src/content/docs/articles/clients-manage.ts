import type { DocArticle } from "../types";

export const clientsManage: DocArticle = {
  slug: "clients-manage",
  title: "Managing client records",
  description:
    "Create, update, search, and soft-deactivate clients safely when they are referenced by sites or jobs.",
  categoryId: "clients",
  keywords: [
    "edit client",
    "search",
    "status",
    "soft delete",
    "account code",
  ],
  relatedSlugs: ["clients-overview", "sites-overview", "cannot-upload"],
  sections: [
    {
      id: "create-edit",
      heading: "Create and edit",
      paragraphs: [
        "Authorized roles create clients from the clients module or Quick Create. Edits stay inside the active organization. Body organizationId values that disagree with request context are ignored or rejected — the membership-bound context wins.",
        "Use account codes when your office already files work by customer number. Notes are for dispatch-facing context (billing contact preferences, preferred call windows), not for storing secrets.",
      ],
    },
    {
      id: "lifecycle",
      heading: "Status and deactivation",
      paragraphs: [
        "Prefer soft-deactivate when a customer relationship ends but historical jobs must remain. Hard-deleting referenced clients is not the operational model — FieldKeel keeps history and soft-deactivates referenced entities.",
        "If create client is blocked, confirm the workspace is not read-only after trial expiry and that your role allows client mutations.",
      ],
    },
  ],
};
