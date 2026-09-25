"use client";

import { Button } from "@/components/ui/button";
import {
  formatStorageBytes,
  isNearExpiry,
} from "@/lib/subscription";
import {
  RenewalActionButton,
  RequestActivationButton,
  RequestPlanChangeButton,
} from "./subscription-banners";
import { useSubscription } from "./subscription-provider";
import { useParams } from "next/navigation";

const SUPPORT_INCLUDED = [
  "Product usage assistance",
  "Account help",
  "Bug reporting",
  "Technical product issues",
  "Activation and renewal assistance",
  "Product updates",
];

const SUPPORT_NOT_INCLUDED = [
  "Custom development",
  "Custom integrations",
  "Custom workflows",
  "Custom reports",
  "Large migrations",
  "Consulting engagements",
];

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function SubscriptionPanel({
  organizationId,
  canManage,
}: {
  organizationId: string;
  canManage: boolean;
}) {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const { subscription, loading } = useSubscription();
  if (loading || !subscription) {
    return (
      <p className="text-sm text-muted-foreground">Loading subscription…</p>
    );
  }

  const supportEmail = subscription.supportEmail ?? "sales@fieldops.local";
  const users = subscription.usage?.users;
  const storage = subscription.usage?.storage;
  const nearExpiry = isNearExpiry(subscription);
  const activationState = subscription.activationProgress?.state ?? "none";
  const showActivationControl =
    canManage &&
    activationState !== "none";
  const showRenewal =
    canManage &&
    (subscription.availableActions.requestRenewal ||
      ["request_sent", "invoice_preparing", "view_invoice", "pay_invoice", "awaiting_verification"].includes(
        subscription.renewalProgress?.state ?? "none",
      ) ||
      subscription.openRequests.some(
        (row) =>
          row.requestType === "RENEWAL" &&
          (row.status === "OPEN" || row.status === "CONTACTED"),
      ));
  const showPlanChange =
    canManage &&
    (subscription.availableActions.requestPlanChange ||
      subscription.openRequests.some(
        (row) =>
          row.requestType === "PLAN_CHANGE" &&
          (row.status === "OPEN" || row.status === "CONTACTED"),
      ));

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Current plan</dt>
          <dd className="font-medium">{subscription.plan.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Subscription status</dt>
          <dd className="font-medium">
            {statusLabel(subscription.effectiveStatus)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Price</dt>
          <dd className="font-medium">{subscription.plan.priceLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Team usage</dt>
          <dd className="font-medium">
            {users
              ? `${users.used} / ${users.included} users`
              : `${subscription.plan.maxUsers} users included`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Storage usage</dt>
          <dd className="font-medium">
            {storage
              ? `${formatStorageBytes(storage.usedBytes)} / ${formatStorageBytes(storage.includedBytes)}`
              : formatStorageBytes(subscription.plan.maxStorageBytes)}
          </dd>
        </div>
        {subscription.effectiveStatus === "TRIALING" ||
        subscription.effectiveStatus === "GRACE" ? (
          <div>
            <dt className="text-muted-foreground">Trial end date</dt>
            <dd>
              {subscription.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString()
                : "—"}
            </dd>
          </div>
        ) : null}
        {subscription.effectiveStatus === "ACTIVE" ||
        subscription.effectiveStatus === "PAID_GRACE" ? (
          <div>
            <dt className="text-muted-foreground">Renewal date</dt>
            <dd>
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : "—"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Support</dt>
          <dd className="font-medium">Standard Support Included</dd>
        </div>
      </dl>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          {showActivationControl ? (
            <RequestActivationButton
              organizationId={organizationId}
              orgSlug={orgSlug}
            />
          ) : null}
          {showRenewal ? (
            <RenewalActionButton
              organizationId={organizationId}
              orgSlug={orgSlug}
              preferRequestLabel={
                nearExpiry ? "Renew Subscription" : "Request Renewal"
              }
            />
          ) : null}
          {showPlanChange ? (
            <RequestPlanChangeButton
              organizationId={organizationId}
              variant="outline"
            />
          ) : null}
          {subscription.availableActions.contactSupport ? (
            <Button asChild variant="outline" className="h-9 min-w-[9rem] md:h-8">
              <a href={`mailto:${supportEmail}`}>Contact Sales</a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-md border border-border px-3 py-3">
        <h3 className="text-sm font-semibold">Standard support</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Included</p>
            <ul className="mt-2 space-y-1 text-sm">
              {SUPPORT_INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Not included automatically
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {SUPPORT_NOT_INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
