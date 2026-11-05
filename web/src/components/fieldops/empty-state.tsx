import { cn } from "cn";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-28 min-w-0 flex-col items-start justify-center gap-2 px-1 py-3 sm:min-h-36 sm:py-4",
        className,
      )}
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="max-w-full text-sm break-words text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
