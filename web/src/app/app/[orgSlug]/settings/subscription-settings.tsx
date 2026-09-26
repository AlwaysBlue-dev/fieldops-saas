"use client";

import { SubscriptionPanel } from "@/components/fieldops/subscription-panel";
import { canManageSubscription, resolveCurrentMembership } from "@/lib/current-org";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SubscriptionSettings() {
  const params = useParams<{ orgSlug: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug).then((match) => {
      if (cancelled) return;
      if (!match) {
        setDenied(true);
        return;
      }
      setOrganizationId(match.organization.id);
      const owner = canManageSubscription(match);
      setCanManage(owner);
      setDenied(!owner);
    });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  if (denied) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
        <p className="text-sm font-medium">Insufficient permission</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the organization owner can manage plan activation and renewal.
        </p>
      </div>
    );
  }

  if (!organizationId) {
    return null;
  }

  return (
    <SubscriptionPanel organizationId={organizationId} canManage={canManage} />
  );
}
