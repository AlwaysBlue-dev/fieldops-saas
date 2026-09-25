"use client";

import { RequestPlanChangeButton } from "@/components/fieldops/subscription-banners";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { getMyOrganizations } from "@/lib/auth";
import {
  formatStorageBytes,
  getOrganizationUsage,
  type OrganizationUsage,
} from "@/lib/subscription";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function subscriptionTone(
  status: string,
): "muted" | "cobalt" | "teal" | "emerald" | "amber" | "crimson" {
  if (status === "ACTIVE" || status === "TRIALING") return "emerald";
  if (status === "GRACE" || status === "PAID_GRACE") return "amber";
  if (status === "SUSPENDED" || status === "CANCELLED" || status === "EXPIRED" || status === "TRIAL_EXPIRED") {
    return "crimson";
  }
  return "muted";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function PlanUsageWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [usage, setUsage] = useState<OrganizationUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyOrganizations()
      .then(async (memberships) => {
        if (cancelled) return;
        const match = memberships.find(
          (item) => item.organization.slug === params.orgSlug,
        );
        if (!match) {
          setError("Organization not found.");
          return;
        }
        setOrganizationId(match.organization.id);
        setCanManage(match.role === "OWNER" || match.role === "ADMIN");
        const next = await getOrganizationUsage(match.organization.id);
        if (!cancelled) setUsage(next);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load plan and usage.");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }
  if (!usage || !organizationId) {
    return (
      <p className="text-sm text-muted-foreground">Loading plan and usage…</p>
    );
  }

  const supportMailto = "mailto:sales@fieldkeel.local";
  const accessUntil = usage.subscription.accessUntil
    ? new Date(usage.subscription.accessUntil).toLocaleDateString()
    : "—";

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Current plan</dt>
          <dd className="text-lg font-semibold">{usage.plan.name}</dd>
          <dd className="text-xs text-muted-foreground">{usage.plan.priceLabel}</dd>
        </div>
        <div>
          <dt className="type-label">Subscription status</dt>
          <dd className="mt-1">
            <StatusPill
              label={statusLabel(usage.subscription.effectiveStatus)}
              tone={subscriptionTone(usage.subscription.effectiveStatus)}
            />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Access until</dt>
          <dd className="font-medium">{accessUntil}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Jobs this month</dt>
          <dd className="font-medium tabular-nums">{usage.jobsThisMonth}</dd>
        </div>
      </dl>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Team seats
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {usage.members.used} / {usage.members.limit}
          </p>
          {usage.members.pendingInvites > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {usage.members.pendingInvites} pending invite
              {usage.members.pendingInvites === 1 ? "" : "s"} count toward the
              limit
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Storage
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatStorageBytes(usage.storage.usedBytes)} /{" "}
            {formatStorageBytes(usage.storage.limitBytes)}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Features</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {usage.features.map((feature) => (
            <li
              key={feature.key}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>{feature.label}</span>
              <span
                className={
                  feature.enabled
                    ? "text-xs font-medium text-emerald-700"
                    : "text-xs text-muted-foreground"
                }
              >
                {feature.enabled ? "Included" : "Not included"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <RequestPlanChangeButton organizationId={organizationId} />
          <Button asChild variant="outline" className="h-9 md:h-8">
            <a href={supportMailto}>Contact Sales</a>
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        There is no in-product checkout. Plan changes are handled manually by
        FieldKeel.
      </p>
    </div>
  );
}
