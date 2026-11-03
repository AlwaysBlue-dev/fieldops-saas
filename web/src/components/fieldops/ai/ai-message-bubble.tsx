import { AiMarkdown } from "./ai-markdown";
import type { AiUiMessage } from "./types";
import { cn } from "cn";

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function AiMessageBubble({ message }: { message: AiUiMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex w-full justify-center px-2">
        <p className="max-w-lg text-center text-xs leading-relaxed text-muted-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[min(100%,42rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-card text-card-foreground shadow-sm",
          message.optimistic && "opacity-80",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <AiMarkdown content={message.content} />
        )}
      </div>
      <time
        dateTime={message.createdAt}
        className="px-1 text-[11px] text-muted-foreground"
      >
        {isUser ? "You" : "Assistant"} · {formatTime(message.createdAt)}
        {message.optimistic ? " · Sending…" : null}
      </time>
    </div>
  );
}
