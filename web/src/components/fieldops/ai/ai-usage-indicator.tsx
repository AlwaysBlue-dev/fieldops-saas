import type { AiUsageSummary } from "@/lib/ai";
import { cn } from "cn";

function formatResetLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const label = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
    return `resets ${label}`;
  } catch {
    return null;
  }
}

export function AiUsageIndicator({
  usage,
  loading,
  unavailable,
  className,
}: {
  usage: AiUsageSummary | null;
  loading?: boolean;
  unavailable?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div
        className={cn(
          "inline-flex min-w-[10.5rem] flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2",
          className,
        )}
      >
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  if (unavailable || !usage) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground",
          className,
        )}
        title="AI usage could not be loaded"
      >
        <span
          className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
          aria-hidden
        />
        <span>
          Usage{" "}
          <span className="font-medium text-foreground/80">unavailable</span>
        </span>
      </div>
    );
  }

  if (!usage.enabled) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-foreground",
          className,
        )}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
        <span>
          AI tasks{" "}
          <span className="font-medium">not on plan</span>
        </span>
      </div>
    );
  }

  const ratio =
    usage.limit > 0 ? Math.min(1, Math.max(0, usage.used / usage.limit)) : 0;
  const exhausted = usage.remaining <= 0;
  const low = !exhausted && usage.remaining <= Math.max(5, usage.limit * 0.1);
  const resetLabel = formatResetLabel(usage.periodResetsAt);

  return (
    <div
      className={cn(
        "inline-flex min-w-[12rem] flex-col gap-1.5 rounded-lg border px-3 py-2",
        exhausted
          ? "border-destructive/35 bg-destructive/5"
          : low
            ? "border-amber/40 bg-amber/10"
            : "border-border bg-card",
        className,
      )}
      title={`${usage.planName}: ${usage.used} of ${usage.limit} AI tasks used this UTC month${resetLabel ? ` · ${resetLabel}` : ""}`}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          <span
            className={cn(
              "font-semibold tabular-nums",
              exhausted ? "text-destructive" : "text-foreground",
            )}
          >
            {usage.used}/{usage.limit}
          </span>{" "}
          tasks
        </span>
        <span
          className={cn(
            "tabular-nums font-medium",
            exhausted
              ? "text-destructive"
              : low
                ? "text-foreground"
                : "text-muted-foreground",
          )}
        >
          {exhausted ? "Limit reached" : `${usage.remaining} left`}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={usage.used}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-label="Monthly AI task usage"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            exhausted
              ? "bg-destructive"
              : low
                ? "bg-amber"
                : "bg-primary",
          )}
          style={{ width: `${Math.max(ratio * 100, exhausted ? 100 : 2)}%` }}
        />
      </div>
      <p className="truncate text-[10px] leading-tight text-muted-foreground">
        {usage.planName}
        {resetLabel ? ` · ${resetLabel}` : " · UTC month"}
      </p>
    </div>
  );
}
