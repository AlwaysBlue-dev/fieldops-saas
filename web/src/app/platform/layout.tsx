"use client";

import { BrandMark } from "@/components/fieldops/brand-mark";
import { OfflineBanner } from "@/components/fieldops/offline-banner";
import { Button } from "@/components/ui/button";
import { getMe, logout, type PublicUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/platform", label: "Dashboard", exact: true },
  { href: "/platform/organizations", label: "Organizations" },
  { href: "/platform/activation-requests", label: "Activation requests" },
  { href: "/platform/invoices", label: "Invoices" },
];

export default function PlatformLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ user: next }) => {
        if (cancelled) return;
        if (next.platformRole !== "SUPER_ADMIN") {
          router.replace("/");
          return;
        }
        setUser(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!user) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground">
        Checking platform access…
      </p>
    );
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-workspace">
      <header
        className="border-b border-border bg-card"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:py-0">
          <Link href="/platform" className="flex min-h-11 items-center gap-2">
            <BrandMark />
            <span className="text-sm font-semibold">FieldKeel Platform Admin</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "inline-flex min-h-11 items-center rounded-md px-3 font-medium text-foreground"
                      : "inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
            <Button
              variant="ghost"
              className="h-11 sm:h-9"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <OfflineBanner message="You’re offline. Platform administration needs a network connection." />
      <main
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
