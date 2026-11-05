import type { DocArticle } from "../types";

export const aiWorkforceCapabilities: DocArticle = {
  slug: "ai-workforce-capabilities",
  title: "What AI Workforce can do",
  description:
    "Lookups for jobs, schedules, and missing site access, plus propose-only changes that need human Approve.",
  categoryId: "ai-workforce",
  keywords: [
    "jobs",
    "schedule",
    "missing access",
    "unassigned",
    "high priority",
    "summarize",
    "propose",
    "approve",
    "job information",
    "site access",
  ],
  relatedSlugs: [
    "ai-workforce-overview",
    "ai-workforce-limits-safety",
    "jobs-overview",
    "schedule-dispatch",
    "sites-access-notes",
  ],
  sections: [
    {
      id: "scope",
      heading: "What the assistant can retrieve today",
      paragraphs: [
        "AI Workforce answers from three lookups: job information you are authorized to see, schedule information for ranges you can view, and jobs that FieldKeel already flags for missing site access details. It can also propose allow-listed changes to jobs, clients, sites, and teams — those proposals stay pending until an owner, admin, or operations manager Approves them. It cannot invent jobs outside your access, open billing records, or apply changes without approval.",
      ],
    },
    {
      id: "proposals",
      heading: "Propose changes for approval",
      paragraphs: [
        "When you ask to draft a job, assign a technician, reschedule, create a client or site, or similar allow-listed actions, the assistant can submit a proposal. FieldKeel does not apply that change until a permitted manager Approves it in AI Workforce.",
        "Reject leaves records unchanged. If the underlying job or customer record changed since the proposal was created, Approve may fail safely so you can propose again.",
      ],
    },
    {
      id: "jobs",
      heading: "Retrieve job information",
      paragraphs: [
        "The assistant can retrieve job lists and filters you are authorized to see — for example by status, priority, schedule window, client, team, or technician assignment — along with summaries such as counts and truncated pages when there are many matches.",
        "Examples you can ask: “Show me today’s scheduled jobs.” “Which jobs are unassigned?” “Show me high-priority jobs.” “List jobs waiting for approval.”",
      ],
    },
    {
      id: "schedule",
      heading: "Review schedules",
      paragraphs: [
        "The assistant can retrieve schedule-board style information for ranges and filters you are allowed to view, so you can ask about what is planned across a day or week.",
        "Examples: “Summarize this week’s schedule.” “What is on the board for tomorrow?” Schedule rows reflect planned work — not a guarantee that a technician is free. See AI Workforce limits and safety.",
      ],
    },
    {
      id: "missing-access",
      heading: "Identify jobs with missing access information",
      paragraphs: [
        "The assistant can identify jobs that FieldKeel already flags for missing site access notes or usable contact information — the same “know before you dispatch” warning used elsewhere in the product.",
        "Example: “Find jobs missing site access information.” Fix access details on the site or job in FieldKeel; the assistant only highlights the gap.",
      ],
    },
    {
      id: "summaries",
      heading: "Summaries and recommendations",
      paragraphs: [
        "After looking data up, the assistant may summarize patterns (for example how many high-priority jobs are open) and suggest next checks for your team. Those summaries are based on the retrieved results — not on hidden databases or write actions.",
        "If a lookup returns a partial page or an error for one filter, the answer should reflect that. Prefer asking a narrower follow-up when results are truncated or incomplete.",
      ],
    },
    {
      id: "not-available",
      heading: "Outside these lookups",
      paragraphs: [
        "AI Workforce does not retrieve payroll, invoices, arbitrary customer message history, or data from other products. If a question needs information FieldKeel has not exposed to the assistant, use the normal screens or ask support — do not expect the assistant to invent it.",
      ],
    },
  ],
};
