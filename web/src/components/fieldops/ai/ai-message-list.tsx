import { AiFollowUpChips, suggestFollowUps } from "./ai-follow-up-chips";
import { AiMessageBubble } from "./ai-message-bubble";
import { AiProposalCard } from "./ai-proposal-card";
import type { AiProposalDetail } from "@/lib/ai";
import type { AiUiMessage } from "./types";
import { useEffect, useMemo, useRef } from "react";

export function AiMessageList({
  messages,
  submitting,
  pendingLabel,
  messageLimitReached,
  messageLimit,
  onPickFollowUp,
  followUpsDisabled,
  sessionProposals,
  onDecideProposal,
}: {
  messages: AiUiMessage[];
  submitting?: boolean;
  pendingLabel?: string;
  /** True when the API returned a full page of messages (cap hit). */
  messageLimitReached?: boolean;
  messageLimit?: number;
  onPickFollowUp?: (prompt: string) => void;
  followUpsDisabled?: boolean;
  sessionProposals?: AiProposalDetail[];
  onDecideProposal?: (
    proposalId: string,
    decision: "APPROVE" | "REJECT",
  ) => Promise<void>;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, submitting, pendingLabel]);

  const followUps = useMemo(() => {
    if (submitting || !onPickFollowUp) return [];
    const visible = messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    );
    const last = visible[visible.length - 1];
    if (!last || last.role !== "assistant" || last.optimistic) return [];
    const lastUser = [...visible]
      .reverse()
      .find((m) => m.role === "user");
    return suggestFollowUps({
      lastUserContent: lastUser?.content ?? null,
      lastAssistantContent: last.content,
    });
  }, [messages, onPickFollowUp, submitting]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-0 py-3 sm:gap-4 sm:py-4 md:py-5">
      {messageLimitReached && messageLimit ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          Showing up to {messageLimit} messages in this conversation. Additional
          messages may exist on the server but are not loaded here.
        </p>
      ) : null}
      {messages.map((message) => (
        <AiMessageBubble key={message.id} message={message} />
      ))}
      {!submitting && sessionProposals && sessionProposals.length > 0
        ? sessionProposals.map((proposal) => (
            <AiProposalCard
              key={proposal.id}
              proposal={proposal}
              onDecide={onDecideProposal}
            />
          ))
        : null}
      {submitting ? (
        <div
          className="flex w-full max-w-3xl items-center gap-3 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground shadow-raise"
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
      {!submitting && followUps.length > 0 ? (
        <AiFollowUpChips
          prompts={followUps}
          onPick={onPickFollowUp!}
          disabled={followUpsDisabled}
          className="w-full max-w-3xl"
        />
      ) : null}
      <div ref={endRef} className="h-3 shrink-0" />
    </div>
  );
}
