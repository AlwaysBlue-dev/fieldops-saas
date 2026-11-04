import type { DocArticle } from "../types";

export const aiWorkforceLimitsSafety: DocArticle = {
  slug: "ai-workforce-limits-safety",
  title: "AI Workforce limits and safety",
  description:
    "Read-only MVP: no assignments, reschedules, status changes, customer messages, or autonomous dispatch. Review answers before acting.",
  categoryId: "ai-workforce",
  keywords: [
    "read-only",
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
      id: "read-only",
      heading: "Read-only by design",
      paragraphs: [
        "AI Workforce in the current product is read-only. It can retrieve and explain authorized operational information. It does not change FieldKeel records on its own.",
      ],
    },
    {
      id: "will-not",
      heading: "What AI Workforce does not do",
      paragraphs: [
        "It does not assign technicians to jobs.",
        "It does not reschedule visits or move jobs on the board.",
        "It does not change job statuses (for example complete, cancel, or submit for approval).",
        "It does not send messages to customers.",
        "It does not autonomously dispatch work or run the board without a person.",
        "Suggested or proposed actions that may appear in product concepts are not executed by AI Workforce today. Any change to jobs, schedule, or membership still happens through the normal FieldKeel screens and permissions.",
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
        "Treat AI answers as assistance, not as an automatic decision. Spot-check important counts or job lists in Jobs or Schedule when the stakes are high.",
        "Data can change after an answer was generated. Ask again or open the live board when you need the latest state.",
      ],
    },
  ],
};
