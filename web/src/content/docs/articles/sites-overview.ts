import type { DocArticle } from "../types";

export const sitesOverview: DocArticle = {
  slug: "sites-overview",
  title: "Sites",
  description:
    "Sites belong to a client inside an organization and carry address, access notes, and on-site contact details for field work.",
  categoryId: "sites",
  keywords: [
    "sites",
    "address",
    "location",
    "access notes",
    "client site",
  ],
  relatedSlugs: [
    "clients-overview",
    "jobs-overview",
    "job-execution",
  ],
  sections: [
    {
      id: "model",
      heading: "Site under a client",
      paragraphs: [
        "A site belongs to a client inside an organization. Composite tenancy rules ensure a site cannot point at another organization’s client. Technicians navigate to sites; jobs typically reference both client and site.",
        "Capture address, optional geo coordinates, access notes (gate codes narrative, parking, hazard notes appropriate for ops), and an on-site contact. Keep sensitive physical access details limited to people who need them for dispatch.",
      ],
    },
    {
      id: "jobs",
      heading: "How jobs use sites",
      paragraphs: [
        "When creating or editing a job card, pick the client and the site where work happens. Schedule and My Day surfaces show site context so crews know where to go. Soft-deactivate sites that are no longer serviced instead of erasing history tied to past jobs.",
      ],
    },
  ],
};
