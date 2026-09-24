"use client";

import { mobilePrimaryNav } from "@/lib/navigation";
import { cn } from "cn";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileBottomNav({
  orgSlug,
  role,
  onMore,
}: {
  orgSlug: string;
  role?: "OWNER" | "ADMIN" | "OPERATIONS_MANAGER" | "SUPERVISOR" | "TECHNICIAN";
  onMore: () => void;
}) {
  const pathname = usePathname();
  const items = mobilePrimaryNav(orgSlug, role);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid h-[3.75rem] grid-cols-5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            className="flex h-full min-h-11 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
