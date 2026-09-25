import type { DocArticle } from "../types";

export const myDay: DocArticle = {
  slug: "my-day",
  title: "My Day",
  description:
    "My Day is the technician’s ordered list of today’s assigned jobs in the organization timezone, with primary field actions.",
  categoryId: "my-day",
  keywords: [
    "my day",
    "home",
    "technician",
    "today",
    "mobile",
  ],
  relatedSlugs: [
    "job-execution",
    "time-gps",
    "navigation-theme",
    "schedule-dispatch",
  ],
  sections: [
    {
      id: "purpose",
      heading: "Home for the field",
      paragraphs: [
        "On mobile, Home is My Day — not a miniature office dashboard. It shows today’s assigned jobs ordered for the organization timezone so “today” matches how the company runs timesheets and overtime.",
        "Primary actions focus on navigate to site, clock in/out, open the job card, and call the site contact. Large targets and sticky actions keep gloves-and-sunlight use realistic.",
      ],
    },
    {
      id: "exceptions",
      heading: "What supervisors watch",
      paragraphs: [
        "Supervisors use My Day and related exception views to spot incomplete cards, missing photos or signatures, and crew issues. Returning a job from approvals puts actionable feedback back on the card the technician opens from My Day.",
      ],
    },
    {
      id: "scope",
      heading: "Assignment scope",
      paragraphs: [
        "Technicians only see jobs assigned to them (and in-scope team assignments per product rules). Switching organization changes which My Day loads. Empty states are empty — FieldKeel does not invent fake production jobs in the UI.",
      ],
    },
  ],
};
