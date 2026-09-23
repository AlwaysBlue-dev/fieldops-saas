import { cn } from "cn";
import type { ReactNode } from "react";

export function StickyMobileActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-auto border-t border-border bg-background px-4 pt-3 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-0",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
