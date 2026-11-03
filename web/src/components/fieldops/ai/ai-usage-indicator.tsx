import type { AiUsageSummary } from "@/lib/ai";
import { cn } from "cn";

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
          "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        Loading usage…
      </div>
    );
  }

  if (unavailable || !usage) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground",
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
          "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <span
          className="size-1.5 shrink-0 rounded-full bg-amber"
          aria-hidden
        />
        <span>
          AI tasks{" "}
          <span className="font-medium text-foreground/80">not on plan</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground",
        className,
      )}
      title={`${usage.planName}: ${usage.used} of ${usage.limit} AI tasks used this month (UTC)`}
    >
      <span
        className="size-1.5 shrink-0 rounded-full bg-emerald"
        aria-hidden
      />
      <span>
        <span className="font-medium text-foreground">
          {usage.used}/{usage.limit}
        </span>{" "}
        AI tasks
        <span className="text-muted-foreground"> · {usage.remaining} left</span>
      </span>
    </div>
  );
}
