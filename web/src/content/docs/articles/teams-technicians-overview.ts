import type { DocArticle } from "../types";

export const teamsTechniciansOverview: DocArticle = {
  slug: "teams-technicians-overview",
  title: "Teams and technicians",
  description:
    "Teams group memberships for dispatch. Manage team status, member skills, and certifications from Teams.",
  categoryId: "teams-technicians",
  keywords: [
    "teams",
    "technicians",
    "certifications",
    "skills",
    "crew",
    "supervisor",
    "deactivate",
    "reactivate",
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
        "Teams are organization-scoped. Owners, admins, and operations managers create and maintain teams. The Teams list defaults to active crews; switch the status filter to Inactive or All to find deactivated teams.",
      ],
    },
    {
      id: "team-status",
      heading: "Team status",
      paragraphs: [
        "Each team is Active or Inactive. Only active teams can be selected for new job assignments. Historical jobs that already reference an inactive team keep that team name — deactivation does not delete history.",
      ],
    },
    {
      id: "deactivate-team",
      heading: "Deactivating a team",
      paragraphs: [
        "From Team details, choose Deactivate team and confirm. Inactive teams remain in FieldOps history but cannot be used for new assignments. Memberships, skills, certifications, and past jobs are retained. Deactivation is not deletion.",
      ],
    },
    {
      id: "reactivate-team",
      heading: "Reactivating a team",
      paragraphs: [
        "Open an inactive team (use the Inactive filter on the Teams list if needed). Choose Reactivate team and confirm. The team becomes Active again and available for assignments and normal operations.",
      ],
    },
    {
      id: "skills",
      heading: "Skills",
      paragraphs: [
        "Skills are an organization catalog (for example Electrical or Inspection). They are assigned to individual technicians, not stored as separate team-owned skill records. The Team → Skills tab shows which skills appear among that team’s members and who holds each skill.",
      ],
    },
    {
      id: "assigning-skills",
      heading: "Assigning skills",
      paragraphs: [
        "From Team → Skills, choose Assign skill. Select an existing organization skill or create a new catalog skill, then choose one or more active team members. Removing a skill from a member only removes that person’s assignment — the organization skill catalog entry remains.",
      ],
    },
    {
      id: "certifications",
      heading: "Certifications",
      paragraphs: [
        "Certifications belong to individual technicians (name, optional certificate number, issued date, expiry date). The Team → Certifications tab lists certifications for members of that team so dispatch can see qualifications in one place.",
      ],
    },
    {
      id: "adding-certifications",
      heading: "Adding certifications",
      paragraphs: [
        "From Team → Certifications, choose Add certification, select an active team member, and enter the certification details. Authorized crew managers can also edit or remove a certification. Removals apply only to that technician’s record.",
      ],
    },
    {
      id: "certification-expiry",
      heading: "Certification expiry",
      paragraphs: [
        "Status is derived from the expiry date: Valid, Expiring soon (within the configured window), Expired, or No expiry when no end date is set. FieldOps does not invent a separate stored status field for this.",
      ],
    },
    {
      id: "profiles",
      heading: "Technician profiles",
      paragraphs: [
        "A technician is a User with an active organization membership in the TECHNICIAN role (or another role that still performs field work). Skills and certifications also appear on the technician profile. Keep certification records accurate; they are operational metadata for dispatch, not a substitute for your compliance program.",
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
