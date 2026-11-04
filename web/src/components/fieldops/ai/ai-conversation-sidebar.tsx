"use client";

import type { AiSessionSummary } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { cn } from "cn";
import {
  MoreHorizontal,
  MessageSquarePlus,
  MessagesSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";

const TITLE_MAX = 200;

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
  onRename,
  onDelete,
  isSessionBusy,
  loading,
  creating,
  listLimit,
  className,
}: {
  conversations: AiSessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** True when a request is in flight for this conversation (blocks delete). */
  isSessionBusy?: (id: string) => boolean;
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

  const [renameTarget, setRenameTarget] = useState<AiSessionSummary | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AiSessionSummary | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openRename(conversation: AiSessionSummary) {
    setRenameTarget(conversation);
    setRenameValue(conversation.title?.trim() || "");
    setRenameError(null);
  }

  function openDelete(conversation: AiSessionSummary) {
    setDeleteTarget(conversation);
    setDeleteError(null);
  }

  async function submitRename() {
    if (!renameTarget || renameBusy) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Enter a title.");
      return;
    }
    if (trimmed.length > TITLE_MAX) {
      setRenameError(`Title must be at most ${TITLE_MAX} characters.`);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await onRename(renameTarget.id, trimmed);
      setRenameTarget(null);
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : "Could not rename conversation.",
      );
    } finally {
      setRenameBusy(false);
    }
  }

  async function submitDelete() {
    if (!deleteTarget || deleteBusy) return;
    if (isSessionBusy?.(deleteTarget.id)) {
      setDeleteError(
        "A request is still running in this conversation. Wait for it to finish, then try again.",
      );
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete conversation.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <p className="type-label text-muted-foreground">Conversations</p>
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
              const busy = Boolean(isSessionBusy?.(conversation.id));
              return (
                <li key={conversation.id} className="group relative">
                  <div
                    className={cn(
                      "flex items-stretch gap-0.5 rounded-lg",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/80",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left transition-colors"
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "my-1 mr-1 size-9 shrink-0 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                            active && "text-accent-foreground md:opacity-100",
                          )}
                          aria-label={`Conversation actions for ${conversation.title?.trim() || "New chat"}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onSelect={() => openRename(conversation)}
                        >
                          <Pencil className="size-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={busy}
                          onSelect={() => {
                            if (!busy) openDelete(conversation);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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

      <Dialog
        open={renameTarget != null}
        onOpenChange={(open) => {
          if (!renameBusy && !open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>
              Choose a short title. Messages in this conversation are unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Conversation title"
              aria-label="Conversation title"
              disabled={renameBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitRename();
                }
              }}
            />
            {renameError ? (
              <p className="text-sm text-destructive" role="alert">
                {renameError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={renameBusy}
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={renameBusy || !renameValue.trim()}
              onClick={() => void submitRename()}
            >
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!deleteBusy && !open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.title?.trim() || "New chat"}
              </span>
              ? Message history for this chat will be removed. Usage and billing
              records are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive" role="alert">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                void submitDelete();
              }}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
