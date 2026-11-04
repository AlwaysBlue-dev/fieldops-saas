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
}: {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  usage: AiUsageSummary | null;
  usageLoading?: boolean;
  usageUnavailable?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {onToggleSidebar ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mt-0.5 lg:hidden"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Hide conversations" : "Show conversations"}
            aria-expanded={sidebarOpen}
          >
            <PanelLeft className="size-4" />
          </Button>
        ) : null}
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-foreground md:text-lg">
              AI Workforce
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-workspace px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald" aria-hidden />
              Live ops
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ask about jobs, schedules, and field readiness.
          </p>
        </div>
      </div>
      <AiUsageIndicator
        className="shrink-0"
        usage={usage}
        loading={usageLoading}
        unavailable={usageUnavailable}
      />
    </header>
  );
}
