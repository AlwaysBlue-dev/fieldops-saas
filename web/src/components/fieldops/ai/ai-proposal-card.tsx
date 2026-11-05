"use client";

import { Button } from "@/components/ui/button";
import type { AiProposalDetail } from "@/lib/ai";
import { cn } from "cn";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";

export function AiProposalCard({
  proposal,
  onDecide,
  className,
}: {
  proposal: AiProposalDetail;
  onDecide?: (
    proposalId: string,
    decision: "APPROVE" | "REJECT",
  ) => Promise<void>;
  className?: string;
}) {
  const [busy, setBusy] = useState<"APPROVE" | "REJECT" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(decision: "APPROVE" | "REJECT") {
    if (!onDecide) return;
    setBusy(decision);
    setError(null);
    try {
      await onDecide(proposal.id, decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update proposal.");
    } finally {
      setBusy(null);
    }
  }

  const pending = proposal.status === "PENDING";
  const showDecide = Boolean(pending && proposal.canDecide && onDecide);

  return (
    <div
      className={cn(
        "max-w-[min(100%,42rem)] rounded-xl border border-border bg-card px-3.5 py-3 shadow-raise",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            AI proposal · {proposal.actionType}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {proposal.summary}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Status: {proposal.status}
            {proposal.expiresAt
              ? ` · expires ${new Date(proposal.expiresAt).toLocaleString()}`
              : null}
          </p>
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-medium",
            pending
              ? "border-amber/40 bg-amber/10 text-foreground"
              : proposal.status === "EXECUTED"
                ? "border-emerald/40 bg-emerald/10 text-foreground"
                : "border-border bg-muted text-muted-foreground",
          )}
        >
          {proposal.status}
        </span>
      </div>

      {showDecide ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy !== null}
            onClick={() => void handle("APPROVE")}
          >
            {busy === "APPROVE" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void handle("REJECT")}
          >
            {busy === "REJECT" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            Reject
          </Button>
        </div>
      ) : pending ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Waiting for an owner, admin, or operations manager to approve.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
