import { cn } from "cn";
import type { ReactNode } from "react";

export function MobileList({
  children,
  empty,
  className,
}: {
  children: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className={cn("flex flex-col gap-2 md:hidden", className)}>
      {hasItems ? children : empty}
    </div>
  );
}

export function MobileListItem({
  title,
  meta,
  trailing,
  className,
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium">{title}</p>
        {meta ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      {trailing}
    </article>
  );
}
