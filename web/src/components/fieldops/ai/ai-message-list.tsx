import { AiMessageBubble } from "./ai-message-bubble";
import type { AiUiMessage } from "./types";
import { useEffect, useRef } from "react";

export function AiMessageList({
  messages,
  submitting,
  pendingLabel,
  messageLimitReached,
  messageLimit,
}: {
  messages: AiUiMessage[];
  submitting?: boolean;
  pendingLabel?: string;
  /** True when the API returned a full page of messages (cap hit). */
  messageLimitReached?: boolean;
  messageLimit?: number;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, submitting, pendingLabel]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-1 py-4">
      {messageLimitReached && messageLimit ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          Showing up to {messageLimit} messages in this conversation. Additional
          messages may exist on the server but are not loaded here.
        </p>
      ) : null}
      {messages.map((message) => (
        <AiMessageBubble key={message.id} message={message} />
      ))}
      {submitting ? (
        <div
          className="flex max-w-[min(100%,42rem)] items-center gap-3 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground shadow-raise"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex gap-1" aria-hidden>
            <span className="size-1.5 animate-pulse rounded-full bg-primary/70" />
            <span className="size-1.5 animate-pulse rounded-full bg-primary/70 [animation-delay:120ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-primary/70 [animation-delay:240ms]" />
          </span>
          <span>{pendingLabel ?? "Looking up operations data…"}</span>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
