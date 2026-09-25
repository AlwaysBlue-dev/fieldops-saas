import type { DocArticle } from "../types";

export const clientsOverview: DocArticle = {
  slug: "clients-overview",
  title: "Clients",
  description:
    "Clients are your customers inside an organization — not FieldKeel tenants. Manage account details, contacts, and status for dispatch.",
  categoryId: "clients",
  keywords: [
    "clients",
    "customers",
    "account",
    "contacts",
    "deactivate",
  ],
  relatedSlugs: [
    "sites-overview",
    "jobs-overview",
    "quick-create-overview",
  ],
  sections: [
    {
      id: "what",
      heading: "What a client is",
      paragraphs: [
        "In FieldKeel, Client means the contractor’s customer — a building owner, facility, or account you perform work for. It is not a FieldKeel tenant. Tenants are Organizations. Confusing the two names is a common mental model mistake when onboarding office staff.",
        "Clients are organization-owned. Search and filters only return clients inside the active organization. Records from another company never appear.",
      ],
    },
    {
      id: "fields",
      heading: "Typical client fields",
      paragraphs: [
        "Capture name, optional account code, contacts, phone, email, notes, and status. Keep naming consistent so dispatchers can find accounts quickly from Quick Create or the clients module.",
        "When a client is referenced by sites or jobs, soft-deactivate instead of hard-deleting. Soft-deactivate preserves history while preventing new work against a closed account.",
      ],
    },
    {
      id: "with-sites",
      heading: "Clients and sites",
      paragraphs: [
        "A client may have many sites. Jobs are typically performed at a site belonging to a client. Create the client first, then add sites with address and access notes, then create job cards that reference both.",
      ],
    },
  ],
};
