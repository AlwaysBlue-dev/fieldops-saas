import type { DocArticle } from "../types";

export const aiWorkforceTroubleshooting: DocArticle = {
  slug: "ai-workforce-troubleshooting",
  title: "AI Workforce troubleshooting",
  description:
    "What FieldKeel messages mean when AI Workforce does not answer, and what to do next — rate limits, timeouts, partial answers, pending requests, and plan limits.",
  categoryId: "ai-workforce",
  keywords: [
    "troubleshooting",
    "unavailable",
    "quota",
    "rate limit",
    "timeout",
    "interrupted",
    "pending",
    "retry",
    "error message",
    "no response",
    "partial",
  ],
  relatedSlugs: [
    "ai-workforce-plans-usage",
    "ai-workforce-roles-access",
    "ai-workforce-overview",
    "ai-workforce-limits-safety",
    "billing-plans",
  ],
  sections: [
    {
      id: "first-steps",
      heading: "If the assistant did not answer",
      paragraphs: [
        "First, open the same conversation and scroll the thread. An answer may already be there, or a partial result may have been saved.",
        "Read the banner or status message carefully — each one means something different. Use the guide below to match the text you see and follow the suggested next step.",
        "Avoid clicking suggested prompts or Send repeatedly in a short time. That can make temporary busy periods worse.",
      ],
    },
    {
      id: "message-guide",
      heading: "What each message means (and what to do)",
      paragraphs: [
        "Use this section as a quick lookup. Find the wording closest to what FieldKeel showed you.",
      ],
    },
    {
      id: "msg-rate-limited",
      heading: "“The assistant is temporarily busy…”",
      paragraphs: [
        "Meaning: The AI service is busy or has hit a short-term usage limit. Your question may not have been fully answered yet.",
        "What to do: Wait about a minute, then send a new message (or use Retry if FieldKeel shows a pending request for this chat). Avoid tapping Send repeatedly.",
      ],
    },
    {
      id: "msg-timeout-uncertain",
      heading: "“The assistant timed out and we cannot confirm…”",
      paragraphs: [
        "Meaning: FieldKeel is not sure whether the AI finished. The product stops and asks you to check instead of guessing.",
        "What to do: Check the conversation for an answer. Wait a moment. If nothing useful appeared, send a new message. This is not the same as a “busy” message — waiting briefly still helps.",
      ],
    },
    {
      id: "msg-partial-lookups",
      heading:
        "“We may have already looked up your jobs or schedule, but the final written answer…”",
      paragraphs: [
        "Meaning: FieldKeel may already have looked up jobs, schedule, or access data, but the final written answer did not finish. The request only partially completed.",
        "What to do: Check the conversation. Wait about a minute if the message says the assistant is busy, then send a new message with the same question. Do not assume the previous answer finished.",
      ],
    },
    {
      id: "msg-rejected",
      heading: "“The assistant could not process that question…”",
      paragraphs: [
        "Meaning: The assistant could not handle that request as sent.",
        "What to do: Start a new chat or send a shorter, clearer question. Try a suggested prompt such as “Jobs for today.” If it keeps happening, contact your workspace administrator.",
      ],
    },
    {
      id: "msg-unreachable",
      heading: "“We could not reach the assistant just now…”",
      paragraphs: [
        "Meaning: FieldKeel could not connect to the assistant in time.",
        "What to do: Check your network, wait briefly, then try again with a new message.",
      ],
    },
    {
      id: "msg-unusable-unexpected",
      heading: "Unusable response or unexpected failure",
      paragraphs: [
        "If you see that the AI returned an unusable response, or that the request failed unexpectedly: wait a moment and send a new message. If it continues, try a new conversation or contact an administrator.",
      ],
    },
    {
      id: "msg-config-auth",
      heading: "Configuration or authentication messages",
      paragraphs: [
        "Messages that say AI is not correctly configured, authentication failed, or AI is temporarily unavailable usually need an administrator. End users cannot fix API keys from the chat screen — report the message to your Owner or Admin.",
      ],
    },
    {
      id: "msg-allowance",
      heading: "Monthly AI task allowance reached",
      paragraphs: [
        "Meaning: Your organization has used its monthly AI task allowance (for example 100 tasks on Professional). New AI requests are blocked until the next usage period (UTC month) or a plan/allowance change.",
        "What to do: You can still open and read past conversations. Retrying will not free capacity. See AI Workforce plans and usage and Plans, pricing, and billing.",
      ],
    },
    {
      id: "msg-pending-retry",
      heading: "Pending request / Retry same request",
      paragraphs: [
        "Meaning: A request for this conversation may still be running, or waiting to be confirmed after a refresh or network blip.",
        "What to do: Use Retry same request when FieldKeel offers it — that continues the same work and does not invent a second task. Use Discard only if you intentionally stop waiting on the client. Open the correct conversation before retrying if you switched chats.",
      ],
    },
    {
      id: "msg-session-network",
      heading: "Session expired or could not reach the server",
      paragraphs: [
        "If your session expired, sign in again. If FieldKeel could not reach the server, your AI request may still be running — wait, refresh, open the same conversation, and use Retry when offered.",
      ],
    },
    {
      id: "starter",
      heading: "AI Workforce unavailable on Starter",
      paragraphs: [
        "If your workspace is on Starter, AI Workforce is not included. Upgrade or change plan through your normal FieldKeel commercial process if you need the assistant. See AI Workforce plans and usage and Plans, pricing, and billing.",
      ],
    },
    {
      id: "roles-plan",
      heading: "Still cannot open AI Workforce",
      paragraphs: [
        "Confirm you are using Owner, Admin, Operations manager, or Supervisor in this organization, that the plan includes AI Workforce, and that the workspace is not read-only for commercial reasons. Technicians will not see AI Workforce in the current product.",
      ],
    },
    {
      id: "good-habits",
      heading: "Habits that reduce failed answers",
      paragraphs: [
        "Prefer one clear question at a time. Use suggested prompts when they match what you need. After an error, wait before retrying. Check the thread before assuming nothing happened. For safety limits and what the assistant will not do, see AI Workforce limits and safety.",
      ],
    },
  ],
};
