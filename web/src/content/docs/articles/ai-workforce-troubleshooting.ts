import type { DocArticle } from "../types";

export const aiWorkforceTroubleshooting: DocArticle = {
  slug: "ai-workforce-troubleshooting",
  title: "AI Workforce troubleshooting",
  description:
    "What to do when AI is unavailable on Starter, the monthly allowance is reached, a provider is busy, or a request was interrupted — including safe retry.",
  categoryId: "ai-workforce",
  keywords: [
    "troubleshooting",
    "unavailable",
    "quota",
    "rate limit",
    "interrupted",
    "pending",
    "retry",
    "session",
    "refresh",
  ],
  relatedSlugs: [
    "ai-workforce-plans-usage",
    "ai-workforce-roles-access",
    "ai-workforce-overview",
    "billing-plans",
  ],
  sections: [
    {
      id: "starter",
      heading: "AI Workforce unavailable on Starter",
      paragraphs: [
        "If your workspace is on Starter, AI Workforce is not included. Upgrade or change plan through your normal FieldKeel commercial process if you need the assistant. See AI Workforce plans and usage and Plans, pricing, and billing.",
      ],
    },
    {
      id: "allowance",
      heading: "Monthly task allowance reached",
      paragraphs: [
        "When the organization has used its monthly AI tasks, new requests are blocked with a clear allowance message. Wait for the next usage period or arrange a plan/allowance change. Retrying the same blocked request will not create free capacity.",
      ],
    },
    {
      id: "provider",
      heading: "Assistant temporarily unavailable or busy",
      paragraphs: [
        "Occasionally the AI service may be rate-limited or temporarily unavailable. FieldKeel may try an alternate configured path when that is safe. If the product reports a failure or asks you to try later, wait briefly and retry.",
        "If the outcome was uncertain or interrupted, use Retry / resume for that same pending request when FieldKeel offers it — do not assume the earlier request finished successfully.",
      ],
    },
    {
      id: "interrupted",
      heading: "Interrupted or uncertain requests",
      paragraphs: [
        "If a request is interrupted or the outcome is uncertain, FieldKeel does not treat it as a successful answer. Prefer the in-product Retry that keeps the same request identity so you do not start a second parallel task for the same instruction.",
        "Do not send a brand-new message that repeats the same instruction while a pending or interrupted request for that conversation is still being reconciled — that can create confusion about which answer is authoritative.",
      ],
    },
    {
      id: "pending-refresh",
      heading: "Pending request after refresh or navigation",
      paragraphs: [
        "If you refresh the page or switch away while a request may still be running, return to AI Workforce and use Retry when prompted. FieldKeel is designed to keep the original request identity for that conversation so retry continues the same work instead of inventing a new task.",
        "Switching between AI conversations keeps each thread’s pending work separate. Open the conversation that owns the pending request before retrying.",
      ],
    },
    {
      id: "roles-plan",
      heading: "Still cannot open AI Workforce",
      paragraphs: [
        "Confirm you are using Owner, Admin, Operations manager, or Supervisor in this organization, that the plan includes AI Workforce, and that the workspace is not read-only for commercial reasons. Technicians will not see AI Workforce in the current product.",
      ],
    },
  ],
};
