import type { DocArticle } from "../types";

export const aiWorkforcePlansUsage: DocArticle = {
  slug: "ai-workforce-plans-usage",
  title: "AI Workforce plans and usage",
  description:
    "Starter has no AI Workforce. Professional includes 100 tasks/month; Business includes 500 by default. How tasks are counted and what happens at the limit.",
  categoryId: "ai-workforce",
  keywords: [
    "AI tasks",
    "quota",
    "allowance",
    "Starter",
    "Professional",
    "Business",
    "100",
    "500",
    "Plan & Usage",
    "monthly limit",
  ],
  relatedSlugs: [
    "ai-workforce-overview",
    "ai-workforce-troubleshooting",
    "billing-plans",
    "organization-settings",
  ],
  sections: [
    {
      id: "by-plan",
      heading: "Plan inclusion",
      paragraphs: [
        "Starter: AI Workforce is not included (0 AI tasks per month).",
        "Professional: AI Workforce is included with 100 AI tasks per month.",
        "Business: AI Workforce is included with a default allowance of 500 AI tasks per month. That Business allowance is commercially configurable and may differ from the published default for your contract, without changing published Starter or Professional prices.",
        "Your workspace must also have an active (or trial) subscription that allows normal product use. Read-only or expired commercial states can block AI along with other write-capable product areas.",
      ],
    },
    {
      id: "what-counts",
      heading: "What counts as one AI task",
      paragraphs: [
        "One AI task is one complete user instruction you send in AI Workforce — the question or request you submit — through to a finished outcome for that request.",
        "When the assistant looks up jobs, schedule, or missing access while answering that instruction, those internal lookups do not each consume an extra task from your monthly allowance. The allowance is tied to your request, not to each internal lookup.",
      ],
    },
    {
      id: "where-to-see",
      heading: "Where to see usage",
      paragraphs: [
        "Authorized users can review AI usage in the product (including the AI Workforce screen and Plan & Usage where your role allows). Counts are maintained by FieldKeel for your organization — not entered by the browser.",
      ],
    },
    {
      id: "at-limit",
      heading: "When you reach the monthly allowance",
      paragraphs: [
        "When your organization has used its monthly AI task allowance, new AI requests are blocked until the allowance renews with the next usage period or your plan/allowance changes. FieldKeel shows a clear plan-limit message; it does not silently start unpaid AI work.",
        "This documentation does not describe automatic overage charges or unused-task rollover. For plan changes, contact FieldKeel as you would for other commercial adjustments — see Plans, pricing, and billing.",
      ],
    },
  ],
};
