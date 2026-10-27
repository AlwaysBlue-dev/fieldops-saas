import { AlertTriangle } from "lucide-react";
import { cn } from "cn";

export function MissingAccessBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      )}
      title="Missing access info"
    >
      <AlertTriangle className="size-3 shrink-0" aria-hidden />
      {compact ? "Access" : "Missing access info"}
    </span>
  );
}
