"use client";

import {
  InstallWorkspaceDialog,
  InstallWorkspaceSettingsCard,
} from "@/components/fieldops/install-workspace";
import { resolveCurrentMembership } from "@/lib/current-org";
import { PWA_DOCS_HREF } from "@/lib/pwa";
import Link from "next/link";
import { useEffect, useState } from "react";

export function SettingsAppDevice({ orgSlug }: { orgSlug: string }) {
  const [open, setOpen] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(orgSlug)
      .then((membership) => {
        if (cancelled || !membership) return;
        setOrgName(membership.organization.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  if (!orgName) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <>
      <InstallWorkspaceSettingsCard
        orgName={orgName}
        onOpenInstall={() => setOpen(true)}
      />
      <p className="mt-3 text-sm text-muted-foreground">
        Current business data always requires an internet connection. Installed
        app icons may not refresh if you change the organization logo later.{" "}
        <Link
          href={PWA_DOCS_HREF}
          className="text-primary underline-offset-2 hover:underline"
        >
          Learn how to install
        </Link>
      </p>
      <InstallWorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        orgName={orgName}
      />
    </>
  );
}
