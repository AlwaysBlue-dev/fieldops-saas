"use client";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  isNearExpiry,
  isTrialEndingSoon,
  requestActivation,
  requestPlanChange,
  requestRenewal,
} from "@/lib/subscription";
import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { useCanMutate } from "./mutation-control";
import { useSubscription } from "./subscription-provider";

export function SubscriptionBanners({
  organizationId,
  orgSlug,
  canManage,
}: {
  organizationId: string;
  orgSlug: string;
  canManage: boolean;
}) {
  const { subscription } = useSubscription();
  if (!subscription) return null;

  if (subscription.effectiveStatus === "TRIALING") {
    if (isTrialEndingSoon(subscription)) {
      return (
        <Banner
          tone="warning"
          title={`Your trial ends in ${subscription.trialDaysRemaining} day${subscription.trialDaysRemaining === 1 ? "" : "s"}.`}
          description="Contact us to activate the workspace before it becomes read-only."
          action={
            canManage ? (
              <RequestActivationButton organizationId={organizationId} />
            ) : null
          }
        />
      );
    }
    return (
      <div className="border-b border-border bg-card px-4 py-1.5 text-xs text-muted-foreground md:px-6">
        {subscription.trialDaysRemaining}{" "}
        {subscription.trialDaysRemaining === 1 ? "day" : "days"} left in trial
      </div>
    );
  }

  if (subscription.effectiveStatus === "GRACE") {
    return (
      <Banner
        tone="warning"
        title={`Your free trial has ended. Your account will become read-only in ${subscription.graceDaysRemaining} day${subscription.graceDaysRemaining === 1 ? "" : "s"}.`}
        description="Existing work continues for now. Contact us to activate this workspace."
        action={
          canManage ? (
            <RequestActivationButton organizationId={organizationId} />
          ) : null
        }
      />
    );
  }

  if (subscription.effectiveStatus === "PAID_GRACE") {
    return (
      <Banner
        tone="warning"
        title={`Your FieldOps Cloud subscription has expired. Renew within ${subscription.graceDaysRemaining} day${subscription.graceDaysRemaining === 1 ? "" : "s"} to avoid your workspace becoming read-only.`}
        description="Existing work continues for now. Payment is arranged with FieldOps outside the product."
        action={
          canManage ? (
            <RequestRenewalButton organizationId={organizationId} />
          ) : null
        }
      />
    );
  }

  if (subscription.effectiveStatus === "ACTIVE" && isNearExpiry(subscription)) {
    return (
      <Banner
        tone="warning"
        title={`Your subscription renews in ${subscription.daysUntilExpiration} day${subscription.daysUntilExpiration === 1 ? "" : "s"}.`}
        description="Request renewal so we can extend the workspace before it expires."
        action={
          canManage ? (
            <RequestRenewalButton
              organizationId={organizationId}
              label="Renew Subscription"
            />
          ) : null
        }
      />
    );
  }

  if (
    subscription.effectiveStatus === "TRIAL_EXPIRED" ||
    subscription.effectiveStatus === "EXPIRED" ||
    subscription.effectiveStatus === "SUSPENDED" ||
    subscription.effectiveStatus === "CANCELLED"
  ) {
    const title =
      subscription.effectiveStatus === "TRIAL_EXPIRED"
        ? "Your trial has ended. Your workspace is read-only."
        : subscription.effectiveStatus === "EXPIRED"
          ? "Your subscription has expired. Your workspace is read-only."
          : subscription.effectiveStatus === "SUSPENDED"
            ? "This workspace is suspended and read-only."
            : "This workspace subscription is cancelled and read-only.";
    return (
      <Banner
        tone="critical"
        title={title}
        description={
          canManage
            ? "Contact us to restore this workspace. Online payment is not available."
            : "An owner or admin can request activation or renewal. Existing records stay visible."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {canManage && subscription.availableActions.requestActivation ? (
              <RequestActivationButton organizationId={organizationId} />
            ) : null}
            {canManage && subscription.availableActions.requestRenewal ? (
              <RequestRenewalButton organizationId={organizationId} />
            ) : null}
            <Button asChild variant="outline" className="h-9 md:h-8">
              <Link href={`/app/${orgSlug}/settings`}>Plan & Subscription</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return null;
}

function Banner({
  tone,
  title,
  description,
  action,
}: {
  tone: "warning" | "critical";
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-b px-4 py-3 md:px-6",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-950",
        tone === "critical" && "border-rose-200 bg-rose-50 text-rose-950",
      )}
      role="status"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-sm opacity-90">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export function RequestActivationButton({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <CommercialRequestButton
      organizationId={organizationId}
      action={requestActivation}
      idleLabel="Request Activation"
      successLabel="Activation request sent. We will contact you shortly."
      defaultMessage="Please activate this FieldOps Cloud workspace."
    />
  );
}

export function RequestRenewalButton({
  organizationId,
  label = "Request Renewal",
}: {
  organizationId: string;
  label?: string;
}) {
  return (
    <CommercialRequestButton
      organizationId={organizationId}
      action={requestRenewal}
      idleLabel={label}
      successLabel="Renewal request sent. We will contact you shortly."
      defaultMessage="Please renew this FieldOps Cloud workspace."
    />
  );
}

export function RequestPlanChangeButton({
  organizationId,
  label = "Request plan change",
  variant = "default",
}: {
  organizationId: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  return (
    <CommercialRequestButton
      organizationId={organizationId}
      action={requestPlanChange}
      idleLabel={label}
      successLabel="Plan change request sent. We will contact you shortly."
      defaultMessage="Please change the plan for this FieldOps Cloud workspace."
      variant={variant}
    />
  );
}

function CommercialRequestButton({
  organizationId,
  action,
  idleLabel,
  successLabel,
  defaultMessage,
  variant = "default",
}: {
  organizationId: string;
  action: (organizationId: string, message?: string) => Promise<unknown>;
  idleLabel: string;
  successLabel: string;
  defaultMessage: string;
  variant?: "default" | "outline";
}) {
  const { refresh } = useSubscription();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        className="h-9 md:h-8"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setMessage(null);
          try {
            await action(organizationId, defaultMessage);
            setMessage(successLabel);
            await refresh();
          } catch (error) {
            setMessage(
              error instanceof ApiError
                ? error.message
                : "Could not send the request.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Sending…" : idleLabel}
      </Button>
      {message ? <p className="text-xs">{message}</p> : null}
    </div>
  );
}

export function TrialChip() {
  const { subscription } = useCanMutate();
  if (!subscription || subscription.effectiveStatus !== "TRIALING") {
    return null;
  }
  return (
    <span className="hidden rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground lg:inline">
      {subscription.trialDaysRemaining} days left in trial
    </span>
  );
}
