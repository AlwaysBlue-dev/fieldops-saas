import type { AiChatMessageRecord, AiSessionSummary } from "@/lib/ai";

export type AiUiRole = "user" | "assistant" | "system";

export type AiUiMessage = {
  id: string;
  role: AiUiRole;
  content: string;
  createdAt: string;
  provider?: string | null;
  model?: string | null;
  /** Optimistic local bubble not yet confirmed by the server. */
  optimistic?: boolean;
};

export type AiUiSession = AiSessionSummary & {
  messages: AiUiMessage[];
  messagesLoaded?: boolean;
};

export function mapApiMessage(message: AiChatMessageRecord): AiUiMessage | null {
  if (message.role === "TOOL") return null;
  const role: AiUiRole =
    message.role === "USER"
      ? "user"
      : message.role === "SYSTEM"
        ? "system"
        : "assistant";
  return {
    id: message.id,
    role,
    content: message.content,
    createdAt: message.createdAt,
    provider: message.provider,
    model: message.model,
  };
}
