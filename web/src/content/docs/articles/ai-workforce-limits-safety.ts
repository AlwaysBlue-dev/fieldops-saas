import type { DocArticle } from "../types";

export const aiWorkforceLimitsSafety: DocArticle = {
  slug: "ai-workforce-limits-safety",
  title: "AI Workforce limits and safety",
  description:
    "Lookups are live; mutations are propose-only and need human Approve. No autonomous dispatch or customer messaging.",
  categoryId: "ai-workforce",
  keywords: [
    "propose",
    "approve",
    "safety",
    "assign",
    "reschedule",
    "dispatch",
    "availability",
    "proposed actions",
    "limitations",
    "review",
  ],
  relatedSlugs: [
    "ai-workforce-troubleshooting",
    "ai-workforce-capabilities",
    "ai-workforce-overview",
    "schedule-dispatch",
    "sites-access-notes",
  ],
  sections: [
    {
      id: "propose-approve",
      heading: "Propose, then approve",
      paragraphs: [
        "AI Workforce can look up authorized jobs, schedules, and missing access information. When you ask it to create or change jobs, clients, sites, or teams, it creates a pending proposal — it does not apply the change by itself.",
        "An owner, admin, or operations manager must Approve or Reject each proposal in AI Workforce. Approval runs the same FieldKeel services and permission checks used by the normal screens.",
      ],
    },
    {
      id: "will-not",
      heading: "What AI Workforce does not do",
      paragraphs: [
        "It does not apply mutations without human Approve.",
        "It does not send messages to customers.",
        "It does not autonomously dispatch the board without a person reviewing the proposal.",
        "It does not change memberships, billing, timesheets, overtime, or upload files in this stage.",
        "Schedule answers are not proof that a technician is free or able to take more work.",
      ],
    },
    {
      id: "schedule-vs-availability",
      heading: "Schedule is not confirmed availability",
      paragraphs: [
        "Schedule answers describe planned work from FieldKeel’s schedule data. They must not be treated as proof that a technician is free, on shift, or able to take more work.",
        "When the assistant talks about workload, it is based on scheduled job counts and related schedule information — not a capacity engine, labor rules engine, or real-time availability calculator. Confirm staffing decisions on the schedule board and with your team.",
      ],
    },
    {
      id: "review",
      heading: "Review before you act",
      paragraphs: [
        "Treat AI answers and proposals as assistance, not as an automatic decision. Spot-check important counts or job lists in Jobs or Schedule when the stakes are high.",
        "Data can change after a proposal was created. If Approve fails because the record changed, reject or recreate the proposal.",
      ],
    },
  ],
};
