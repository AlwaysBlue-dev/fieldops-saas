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
  relatedSlugs: [
    "sites-overview",
    "my-day",
    "job-execution",
    "schedule-dispatch",
    "offline-field-operations",
  ],
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
        "A job may also carry a Customer contact on site (job-level). That job contact counts as a valid contact for access readiness even when the site record itself has no contact name or phone.",
      ],
    },
    {
      id: "missing-access",
      heading: "Missing access info warning",
      paragraphs: [
        "Active jobs (not completed or cancelled) are flagged Missing access info when the site’s Access notes are empty, or when both the site and the job lack usable contact name/phone. FieldKeel calculates this on the server and shows an amber badge on Jobs and Schedule, a warning on Job Details, a Missing access tab on Jobs, and a Missing access only schedule filter.",
        "Users who can edit clients/sites see Add access info, which opens the existing site edit form. Saving the site and refreshing clears the warning only after the server recalculates readiness. Dispatch may still proceed after a soft confirmation — this warning is not a hard block.",
      ],
    },
  ],
};
