"use client";

import {
  MarketingAuthActions,
  MarketingAuthProvider,
} from "@/components/fieldops/marketing-auth-actions";
import { BrandMark } from "@/components/fieldops/brand-mark";
import { PwaInstallProvider } from "@/components/fieldops/pwa-install-provider";
import { JsonLd } from "@/components/fieldops/json-ld";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { SITE_URL } from "@/lib/seo";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: APP_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icons/logo.png`,
};

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/compare", label: "Compare" },
  { href: "/docs", label: "Documentation" },
  { href: "/trust", label: "Trust" },
];

const footer = {
  Product: [
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/docs", label: "Documentation" },
    { href: "/support", label: "Support" },
  ],
  Trust: [
    { href: "/trust", label: "Trust Center" },
    { href: "/security", label: "Security" },
  ],
  Compare: [
    { href: "/compare/jobber", label: "Jobber" },
    { href: "/compare/housecall-pro", label: "Housecall Pro" },
    { href: "/compare/servicetitan", label: "ServiceTitan" },
    { href: "/compare", label: "All comparisons" },
  ],
  Legal: [
    { href: "/terms", label: "Terms of Service" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/security", label: "Security" },
    { href: "/billing-policy", label: "Billing & Subscription Policy" },
    { href: "/refund-policy", label: "Refund Policy" },
    { href: "/acceptable-use", label: "Acceptable Use" },
  ],
};

export function MarketingShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  /** Wider main column for documentation and similar dense layouts. */
  wide?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <PwaInstallProvider>
      <MarketingAuthProvider>
        <div className="min-h-dvh overflow-x-hidden bg-workspace">
          <JsonLd data={organizationJsonLd} />
          <header
            className="sticky top-0 z-20 border-b border-border bg-card/95"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div
              className={
                wide
                  ? "mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4"
                  : "mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4"
              }
            >
              <Link
                href="/"
                className="flex items-center gap-2"
                aria-label={`${APP_NAME} home`}
              >
                <BrandMark variant="full" />
              </Link>
              <nav
                className="hidden items-center gap-5 text-sm md:flex"
                aria-label="Marketing"
              >
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                  <SheetTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 md:hidden"
                      aria-label="Open menu"
                    >
                      <Menu className="size-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[min(100%,20rem)]">
                    <SheetHeader>
                      <SheetTitle>Menu</SheetTitle>
                    </SheetHeader>
                    <nav
                      className="mt-4 flex flex-col gap-1"
                      aria-label="Marketing mobile"
                    >
                      {links.map((link) => (
                        <SheetClose asChild key={link.href}>
                          <Link
                            href={link.href}
                            className="rounded-md px-3 py-3 text-base text-foreground hover:bg-muted"
                          >
                            {link.label}
                          </Link>
                        </SheetClose>
                      ))}
                    </nav>
                  </SheetContent>
                </Sheet>
                <MarketingAuthActions />
              </div>
            </div>
          </header>
          <main
            className={
              wide
                ? "mx-auto w-full max-w-7xl px-4 py-6 md:py-10"
                : "mx-auto w-full max-w-6xl px-4 py-10 md:py-16"
            }
          >
            {children}
          </main>
          <footer
            className="border-t border-border"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div
              className={
                wide
                  ? "mx-auto grid max-w-7xl gap-8 px-4 py-8 text-sm md:grid-cols-3 lg:grid-cols-5"
                  : "mx-auto grid max-w-6xl gap-8 px-4 py-8 text-sm md:grid-cols-3 lg:grid-cols-5"
              }
            >
              {Object.entries(footer).map(([heading, items]) => (
                <div key={heading}>
                  <p className="font-medium text-foreground">{heading}</p>
                  <ul className="mt-3 space-y-2 text-muted-foreground">
                    {items.map((item) => (
                      <li key={`${heading}-${item.href}-${item.label}`}>
                        <Link href={item.href}>{item.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div>
                <p className="font-medium text-foreground">{APP_NAME}</p>
                <p className="mt-2 text-muted-foreground">{APP_TAGLINE}</p>
                <p className="mt-3 text-muted-foreground">
                  © {new Date().getFullYear()} {APP_NAME}
                </p>
              </div>
            </div>
          </footer>
        </div>
      </MarketingAuthProvider>
    </PwaInstallProvider>
  );
}
