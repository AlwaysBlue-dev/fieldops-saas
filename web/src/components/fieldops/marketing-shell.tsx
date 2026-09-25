import { BrandMark } from "@/components/fieldops/brand-mark";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import Link from "next/link";
import type { ReactNode } from "react";

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
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
  Legal: [
    { href: "/terms", label: "Terms of Service" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/security", label: "Security" },
    { href: "/billing-policy", label: "Billing & Subscription Policy" },
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
  return (
    <div className="min-h-dvh overflow-x-hidden bg-workspace">
      <header
        className="sticky top-0 z-20 border-b border-border bg-card/95"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div
          className={
            wide
              ? "mx-auto flex h-14 max-w-7xl items-center justify-between px-4"
              : "mx-auto flex h-14 max-w-6xl items-center justify-between px-4"
          }
        >
          <Link href="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="text-sm font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm md:flex" aria-label="Marketing">
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
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Start trial</Link>
            </Button>
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
              ? "mx-auto grid max-w-7xl gap-8 px-4 py-8 text-sm md:grid-cols-4"
              : "mx-auto grid max-w-6xl gap-8 px-4 py-8 text-sm md:grid-cols-4"
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
  );
}
