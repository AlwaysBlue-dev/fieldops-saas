import { cn } from "cn";
import type { ReactNode } from "react";

/** Sticky primary actions clear the mobile bottom nav + home indicator. */
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
        "sticky bottom-0 z-20 -mx-4 mt-auto border-t border-border bg-card/95 px-4 pt-3 backdrop-blur-sm md:static md:mx-0 md:mt-4 md:border-0 md:bg-transparent md:px-0 md:pt-0 md:backdrop-blur-none",
        "pb-[calc(4.25rem+max(0.75rem,env(safe-area-inset-bottom)))] md:pb-0",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>
    </div>
  );
}
