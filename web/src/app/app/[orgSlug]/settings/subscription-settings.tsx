"use client";

import { SubscriptionPanel } from "@/components/fieldops/subscription-panel";
import { getMyOrganizations } from "@/lib/auth";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SubscriptionSettings() {
  const params = useParams<{ orgSlug: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyOrganizations().then((memberships) => {
      if (cancelled) return;
      const match = memberships.find(
        (item) => item.organization.slug === params.orgSlug,
      );
      if (!match) return;
      setOrganizationId(match.organization.id);
      setCanManage(match.role === "OWNER" || match.role === "ADMIN");
    });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  if (!organizationId) {
    return null;
  }

  return (
    <SubscriptionPanel organizationId={organizationId} canManage={canManage} />
  );
}
