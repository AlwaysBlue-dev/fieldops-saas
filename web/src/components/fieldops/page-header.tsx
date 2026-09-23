import { cn } from "cn";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  className,
  hideTitleOnMobile = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  hideTitleOnMobile?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            "text-lg font-semibold tracking-tight text-foreground md:text-xl",
            hideTitleOnMobile && "hidden md:block",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
