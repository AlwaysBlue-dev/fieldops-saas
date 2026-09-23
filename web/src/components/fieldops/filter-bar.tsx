import { cn } from "cn";
import type { ReactNode } from "react";

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
