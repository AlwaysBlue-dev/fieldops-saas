"use client";

import { AiProposalCard } from "./ai-proposal-card";
import { Button } from "@/components/ui/button";
import type { AiProposalDetail, AiProposalSummary } from "@/lib/ai";
import { cn } from "cn";
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";

export function AiProposalsInboxButton({
  count,
  loading,
  open,
  onToggle,
}: {
  count: number;
  loading?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-9 gap-2",
        open && "border-primary/40 bg-accent/50",
      )}
      onClick={onToggle}
      aria-expanded={open}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <ClipboardList className="size-3.5" />
      )}
      Pending AI
      {count > 0 ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Button>
  );
}

export function AiProposalsInboxPanel({
  items,
  details,
  loading,
  onRefresh,
  onLoadDetail,
  onDecide,
  onClose,
}: {
  items: AiProposalSummary[];
  details: Record<string, AiProposalDetail>;
  loading?: boolean;
  onRefresh: () => void;
  onLoadDetail: (id: string) => Promise<void>;
  onDecide: (
    proposalId: string,
    decision: "APPROVE" | "REJECT",
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);

  return (
    <div className="border-b border-border bg-card px-4 py-3 md:px-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Pending AI actions
        </h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onRefresh}>
            Refresh
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      {loading && items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading proposals…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No pending AI proposals for this organization.
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {items.map((item) => {
            const detail = details[item.id];
            return (
              <li key={item.id}>
                {detail ? (
                  <AiProposalCard proposal={detail} onDecide={onDecide} />
                ) : (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-border bg-workspace px-3 py-2 text-left text-sm hover:border-primary/30"
                    disabled={opening === item.id}
                    onClick={() => {
                      setOpening(item.id);
                      void onLoadDetail(item.id).finally(() => setOpening(null));
                    }}
                  >
                    <span className="font-medium text-foreground">
                      {item.actionType}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.status} · tap to review
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
