"use client";

import { OrganizationBrandingPanel } from "@/components/fieldops/organization-branding-panel";
import { resolveCurrentMembership, canInviteMembers } from "@/lib/current-org";
import { useEffect, useState } from "react";

export function SettingsBrandingSection({ orgSlug }: { orgSlug: string }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(orgSlug)
      .then((membership) => {
        if (cancelled || !membership) return;
        setOrganizationId(membership.organization.id);
        setCanManage(canInviteMembers(membership));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  if (!organizationId) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <OrganizationBrandingPanel
      organizationId={organizationId}
      canManage={canManage}
    />
  );
}
