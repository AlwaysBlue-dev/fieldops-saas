"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PWA_DOCS_HREF, workspaceAppName } from "@/lib/pwa";
import { Check, Download, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePwaInstall } from "./pwa-install-provider";

export const INSTALL_APP_LABEL = "Install FieldKeel App";
export const INSTALL_APP_LABEL_SHORT = "Install App";

export function InstallWorkspaceDialog({
  open,
  onOpenChange,
  orgName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgName?: string;
}) {
  const {
    isInstalled,
    canPromptInstall,
    needsIosInstructions,
    promptInstall,
  } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const title = isInstalled ? "Installed" : INSTALL_APP_LABEL;
  const appLabel = orgName ? workspaceAppName(orgName) : "FieldKeel";

  const onInstall = async () => {
    setBusy(true);
    setMessage(null);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted" || outcome === "standalone") {
      setMessage("FieldKeel is installed on this device.");
      return;
    }
    if (outcome === "dismissed") {
      setMessage("Installation was cancelled. You can try again anytime.");
      return;
    }
    setMessage(
      "This browser does not expose an install prompt. Use the steps below or your browser’s install menu.",
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Install FieldKeel on your phone, tablet, or desktop for quick
            access to jobs, schedules, and field operations. Your account and
            secure cookies stay the same — no app store download.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="font-medium text-foreground">{appLabel}</span>
            <span className="mt-0.5 block text-muted-foreground">
              Opening the installed app takes you into FieldKeel. You can still
              switch organizations inside the product when you belong to more
              than one.
            </span>
          </p>

          {isInstalled ? (
            <p className="flex items-start gap-2 text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              FieldKeel is already running as an installed app on this device.
            </p>
          ) : needsIosInstructions ? (
            <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
              <li>
                Tap the <span className="font-medium text-foreground">Share</span>{" "}
                button in Safari.
              </li>
              <li>
                Choose{" "}
                <span className="font-medium text-foreground">
                  Add to Home Screen
                </span>
                .
              </li>
              <li>
                Tap <span className="font-medium text-foreground">Add</span>.
              </li>
            </ol>
          ) : canPromptInstall ? (
            <p className="text-muted-foreground">
              Tap {INSTALL_APP_LABEL} below to use your browser’s install
              prompt. FieldKeel never auto-prompts.
            </p>
          ) : (
            <p className="text-muted-foreground">
              If your browser supports installable web apps, use its menu
              (Install app / Add to Home Screen). On iPhone, open FieldKeel in
              Safari and follow Share → Add to Home Screen.
            </p>
          )}

          {message ? (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button asChild variant="ghost" className="h-11 justify-start sm:h-8">
            <Link href={PWA_DOCS_HREF} onClick={() => onOpenChange(false)}>
              Learn how to install
            </Link>
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-8"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {!isInstalled && canPromptInstall ? (
              <Button
                type="button"
                className="h-11 sm:h-8"
                disabled={busy}
                onClick={() => void onInstall()}
              >
                <Download className="size-4" />
                {INSTALL_APP_LABEL}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact status row for Settings → App & device. */
export function InstallWorkspaceSettingsCard({
  orgName,
  onOpenInstall,
}: {
  orgName: string;
  onOpenInstall: () => void;
}) {
  const { isInstalled, needsIosInstructions, canPromptInstall } =
    usePwaInstall();

  let status = "Not installed";
  if (isInstalled) status = "Installed";
  else if (needsIosInstructions) status = "Add via Safari Share";
  else if (canPromptInstall) status = "Ready to install";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{INSTALL_APP_LABEL}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Install FieldKeel on this device for app-like access.
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">Status: {status}</p>
      </div>
      {isInstalled ? (
        <span className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 md:h-8">
          <Check className="size-4" />
          Installed
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-8"
          onClick={onOpenInstall}
        >
          <Smartphone className="size-4" />
          {INSTALL_APP_LABEL}
        </Button>
      )}
    </div>
  );
}
