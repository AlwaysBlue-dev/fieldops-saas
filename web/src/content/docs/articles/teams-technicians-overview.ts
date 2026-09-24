import type { DocArticle } from "../types";

export const teamsTechniciansOverview: DocArticle = {
  slug: "teams-technicians-overview",
  title: "Teams and technicians",
  description:
    "Teams group memberships for dispatch. Technician profiles hold employee codes, trades, certifications, status, and home team.",
  categoryId: "teams-technicians",
  keywords: [
    "teams",
    "technicians",
    "certifications",
    "skills",
    "crew",
    "supervisor",
  ],
  relatedSlugs: [
    "roles",
    "schedule-dispatch",
    "members-invitations",
    "my-day",
  ],
  sections: [
    {
      id: "teams",
      heading: "Teams for dispatch",
      paragraphs: [
        "Teams group memberships for dispatch — for example “HVAC North” or “Electrical Service.” Assign jobs to a team and/or individual technicians. Supervisors can be associated with teams they lead so their approvals and report scope follow the crew.",
        "Teams are organization-scoped. Renaming or deactivating a team does not erase historical job assignments; prefer soft-deactivate for crews that no longer operate.",
      ],
    },
    {
      id: "profiles",
      heading: "Technician profiles",
      paragraphs: [
        "A technician is a User with an active organization membership in the TECHNICIAN role (or another role that still performs field work). Technician-specific fields live on a profile: employee code, trades/skills, status, and home team — not on the global User record.",
        "Certifications exist on technician profiles so office staff can see qualifications when assigning work. Keep certification records accurate; they are operational metadata for dispatch, not a substitute for your compliance program.",
      ],
    },
    {
      id: "membership",
      heading: "Inviting technicians",
      paragraphs: [
        "Invite technicians through Members with the TECHNICIAN role, then complete their profile. Seat limits on the plan apply to memberships. After acceptance they appear for assignment on jobs and the schedule board.",
      ],
    },
  ],
};
