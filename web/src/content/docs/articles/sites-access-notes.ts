import type { DocArticle } from "../types";

export const sitesAccess: DocArticle = {
  slug: "sites-access-notes",
  title: "Site access and contacts",
  description:
    "Use site access notes and on-site contacts so technicians arrive prepared without cluttering the job card.",
  categoryId: "sites",
  keywords: [
    "access notes",
    "gate",
    "on-site contact",
    "coordinates",
    "navigate",
  ],
  relatedSlugs: ["sites-overview", "my-day", "job-execution"],
  sections: [
    {
      id: "notes",
      heading: "Access notes that help the field",
      paragraphs: [
        "Access notes should answer: how to enter, where to park, who to call on arrival, and any site-specific safety context the crew needs before opening tools. Prefer short operational language over long narrative.",
        "Coordinates support navigation from My Day and job cards when present. They are not a substitute for continuous tracking — FieldKeel captures GPS on clock in/out events according to organization settings, not continuous location streaming.",
      ],
    },
    {
      id: "contacts",
      heading: "On-site contacts",
      paragraphs: [
        "Store an on-site contact distinct from the client’s billing contact when they differ. Technicians often need a facilities manager or site supervisor, not the accounts payable desk.",
      ],
    },
  ],
};
