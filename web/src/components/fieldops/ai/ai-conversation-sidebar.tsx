import type { AiSessionSummary } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { cn } from "cn";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";

function formatUpdatedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function AiConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  loading,
  creating,
  listLimit,
  className,
}: {
  conversations: AiSessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  loading?: boolean;
  creating?: boolean;
  /** Backend listSessions take cap — shown when the list is full. */
  listLimit?: number;
  className?: string;
}) {
  const atListLimit =
    typeof listLimit === "number" &&
    listLimit > 0 &&
    conversations.length >= listLimit;

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Conversations
        </p>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onNewChat}
          disabled={creating || loading}
        >
          <MessageSquarePlus className="size-3.5" />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {loading ? (
          <div className="px-1 py-2">
            <SkeletonBlock rows={6} />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-lg px-2 py-6 text-sm text-muted-foreground">
            <MessagesSquare className="size-5 text-muted-foreground/70" />
            <p className="font-medium text-foreground">No conversations yet</p>
            <p className="text-xs leading-relaxed">
              Start a new chat to begin. Sessions are saved for your account in
              this organization.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5" role="list">
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/80",
                    )}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className="line-clamp-1 w-full text-sm font-medium">
                      {conversation.title?.trim() || "New chat"}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        active
                          ? "text-accent-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatUpdatedAt(conversation.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {atListLimit ? (
        <p className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Showing the latest {listLimit} conversations. Older sessions remain
          available on the server but are not listed here.
        </p>
      ) : null}
    </aside>
  );
}
