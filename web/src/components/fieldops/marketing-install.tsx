"use client";

import {
  INSTALL_APP_LABEL,
  InstallWorkspaceDialog,
} from "@/components/fieldops/install-workspace";
import { Button } from "@/components/ui/button";
import { PWA_DOCS_HREF, isStandaloneDisplay } from "@/lib/pwa";
import { Download, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePwaInstallOptional } from "./pwa-install-provider";

/** Subtle capability badge for the landing hero (not a primary CTA). */
export function MarketingAppCapabilityBadge() {
  return (
    <p className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      <Smartphone className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <span>Installable on mobile &amp; desktop</span>
    </p>
  );
}

/**
 * Public / marketing install action using the existing PWA prompt when available.
 * Hidden when already running as an installed app.
 */
export function MarketingInstallAppButton({
  variant = "default",
  className,
  shortLabel = false,
}: {
  variant?: "default" | "outline" | "secondary";
  className?: string;
  shortLabel?: boolean;
}) {
  const pwa = usePwaInstallOptional();
  const [open, setOpen] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
  }, []);

  const isInstalled = pwa?.isInstalled || standalone;
  if (isInstalled) return null;

  const label = shortLabel ? "Install App" : INSTALL_APP_LABEL;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => {
          if (pwa?.canPromptInstall) {
            void pwa.promptInstall().then((outcome) => {
              if (outcome === "unavailable" || outcome === "dismissed") {
                setOpen(true);
              }
            });
            return;
          }
          setOpen(true);
        }}
      >
        <Download className="size-4" />
        {label}
      </Button>
      <InstallWorkspaceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function MarketingInstallAppSection() {
  const pwa = usePwaInstallOptional();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
  }, []);

  const isInstalled = pwa?.isInstalled || standalone;

  return (
    <section className="mt-16 rounded-lg border border-border bg-card px-4 py-5 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-base font-semibold tracking-tight md:text-lg">
            FieldKeel goes wherever your team goes
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Install FieldKeel on your phone, tablet, or desktop for quick access
            to jobs, schedules, My Day, sites, and field operations — without
            needing an app store.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            <Link
              href={PWA_DOCS_HREF}
              className="text-primary underline-offset-2 hover:underline"
            >
              How to install FieldKeel
            </Link>
          </p>
        </div>
        {isInstalled ? (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            FieldKeel is installed on this device
          </p>
        ) : (
          <MarketingInstallAppButton
            variant="outline"
            className="h-11 w-full shrink-0 md:h-9 md:w-auto"
          />
        )}
      </div>
    </section>
  );
}
