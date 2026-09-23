import { cn } from "cn";

export function MetricCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-r border-border px-3 py-2 last:border-r-0",
        className,
      )}
    >
      <p className="type-label">{label}</p>
      <p className="type-numeric mt-1 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
