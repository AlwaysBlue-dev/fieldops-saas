import { AiProposalsInboxButton } from "./ai-proposals-inbox";
import { AiUsageIndicator } from "./ai-usage-indicator";
import type { AiUsageSummary } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { PanelLeft, Sparkles } from "lucide-react";

export function AiChatHeader({
  onToggleSidebar,
  sidebarOpen,
  usage,
  usageLoading,
  usageUnavailable,
  pendingProposalCount,
  proposalsLoading,
  proposalsOpen,
  onToggleProposals,
  canReviewProposals,
}: {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  usage: AiUsageSummary | null;
  usageLoading?: boolean;
  usageUnavailable?: boolean;
  pendingProposalCount?: number;
  proposalsLoading?: boolean;
  proposalsOpen?: boolean;
  onToggleProposals?: () => void;
  canReviewProposals?: boolean;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-1.5 border-b border-border bg-card px-2 py-2 sm:gap-3 sm:px-4 sm:py-2.5 md:px-5 md:py-3">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        {onToggleSidebar ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 sm:size-11 lg:hidden"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Hide conversations" : "Show conversations"}
            aria-expanded={sidebarOpen}
          >
            <PanelLeft className="size-5" />
          </Button>
        ) : null}
        <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground md:text-lg">
              AI Workforce
            </h1>
            <span className="hidden items-center gap-1.5 rounded-md border border-border bg-workspace px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald" aria-hidden />
              Propose + approve
            </span>
          </div>
          <p className="mt-0.5 hidden text-sm text-muted-foreground md:block">
            Look up ops data and propose job, client, site, or team changes for approval.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {canReviewProposals && onToggleProposals ? (
          <AiProposalsInboxButton
            count={pendingProposalCount ?? 0}
            loading={proposalsLoading}
            open={Boolean(proposalsOpen)}
            onToggle={onToggleProposals}
          />
        ) : null}
        <AiUsageIndicator
          usage={usage}
          loading={usageLoading}
          unavailable={usageUnavailable}
        />
      </div>
    </header>
  );
}
