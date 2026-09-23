"use client";

import { RequestActivationButton } from "./subscription-banners";
import { useSubscription } from "./subscription-provider";

export function SubscriptionPanel({
  organizationId,
  canManage,
}: {
  organizationId: string;
  canManage: boolean;
}) {
  const { subscription, loading } = useSubscription();
  if (loading || !subscription) {
    return (
      <p className="text-sm text-muted-foreground">Loading subscription…</p>
    );
  }

  const ended =
    subscription.effectiveStatus === "TRIAL_EXPIRED" ||
    subscription.effectiveStatus === "SUSPENDED" ||
    subscription.effectiveStatus === "CANCELLED";

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium">{subscription.effectiveStatus.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium">{subscription.plan.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Trial ends</dt>
          <dd>
            {subscription.trialEndsAt
              ? new Date(subscription.trialEndsAt).toLocaleDateString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Grace ends</dt>
          <dd>
            {subscription.graceEndsAt
              ? new Date(subscription.graceEndsAt).toLocaleDateString()
              : "—"}
          </dd>
        </div>
      </dl>
      {ended && canManage ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-3">
          <p className="text-sm font-semibold">Your trial has ended</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Contact us to activate your workspace. There is no online checkout.
          </p>
          <div className="mt-3">
            <RequestActivationButton organizationId={organizationId} />
          </div>
        </div>
      ) : null}
      {!ended && canManage && subscription.effectiveStatus !== "ACTIVE" ? (
        <RequestActivationButton organizationId={organizationId} />
      ) : null}
    </div>
  );
}
