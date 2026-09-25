import { BrandMark } from "@/components/fieldops/brand-mark";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-workspace">
      <div
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10"
        style={{
          paddingTop: "max(2.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <Link href="/" className="mb-8 inline-flex flex-col gap-1">
          <span className="inline-flex items-center gap-2">
            <BrandMark />
            <span className="text-sm font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </span>
          <span className="pl-9 text-xs text-muted-foreground">{APP_TAGLINE}</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}
