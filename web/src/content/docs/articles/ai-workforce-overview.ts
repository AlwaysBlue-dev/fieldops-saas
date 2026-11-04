import type { DocArticle } from "../types";

export const aiWorkforceOverview: DocArticle = {
  slug: "ai-workforce-overview",
  title: "What is AI Workforce?",
  description:
    "FieldKeel’s natural-language assistant for understanding jobs, schedules, and operational gaps — available on Professional and Business plans.",
  categoryId: "ai-workforce",
  keywords: [
    "AI Workforce",
    "AI assistant",
    "chat",
    "natural language",
    "operations",
    "Professional",
    "Business",
    "conversation",
  ],
  relatedSlugs: [
    "ai-workforce-capabilities",
    "ai-workforce-plans-usage",
    "ai-workforce-roles-access",
    "ai-workforce-limits-safety",
    "ai-workforce-troubleshooting",
    "billing-plans",
  ],
  sections: [
    {
      id: "what-it-is",
      heading: "What AI Workforce is",
      paragraphs: [
        "AI Workforce is FieldKeel’s in-product assistant for office and supervisory roles. You ask questions in everyday language, and the assistant retrieves information you are already allowed to see — jobs, schedules, and missing site access signals — then summarizes what it found.",
        "It is designed to help operations staff understand the current board faster: what is scheduled, what is unassigned, what is high priority, and where access details are incomplete. It does not replace your schedule board, job cards, or approval workflows.",
      ],
    },
    {
      id: "how-you-use-it",
      heading: "How you interact with it",
      paragraphs: [
        "Open AI Workforce from the workspace navigation (where your role and plan allow it). Start a conversation, type a question, and review the answer in the same thread.",
        "Each message is a natural-language instruction. The assistant may look up operational data before answering. FieldKeel may use more than one configured AI service and can try another when one is temporarily unavailable. You stay in control: use the answer to decide what to do next in the normal FieldKeel screens.",
      ],
    },
    {
      id: "history",
      heading: "Conversation history",
      paragraphs: [
        "Conversations are saved in your organization workspace so you can return to a thread later. Switching between conversations keeps each thread separate. If a request is still running when you leave or refresh, FieldKeel can help you resume that same request instead of starting a duplicate.",
        "History helps the assistant stay contextual within a thread. Older answers reflect data as it was when retrieved — refresh with a new question when you need the latest board state.",
      ],
    },
    {
      id: "boundaries",
      heading: "Organization and permission boundaries",
      paragraphs: [
        "AI Workforce only works inside the organization you currently have selected. It uses your signed-in membership and role. It cannot open another organization’s jobs or schedules.",
        "Within your organization, job and schedule results still follow the same visibility rules as the rest of FieldKeel. The assistant does not bypass team, assignment, or role restrictions.",
      ],
    },
    {
      id: "plans",
      heading: "Which plans include AI Workforce",
      paragraphs: [
        "AI Workforce is included on Professional (100 AI tasks per month) and Business (500 AI tasks per month by default; Business allowances may be configured commercially). It is not available on Starter.",
        "For plan capacity, allowances, and what counts as a task, see AI Workforce plans and usage. For role access, see Who can use AI Workforce.",
      ],
    },
  ],
};
