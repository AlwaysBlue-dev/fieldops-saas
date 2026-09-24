"use client";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  isNearExpiry,
  isTrialEndingSoon,
  requestActivation,
  requestPlanChange,
  requestRenewal,
  type OrganizationSubscription,
} from "@/lib/subscription";
import { cn } from "cn";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCanMutate } from "./mutation-control";
import { useSubscription } from "./subscription-provider";

const ACTIVATION_CONTROL_CLASS =
  "h-9 min-w-[13rem] justify-center px-3 md:h-8 md:min-w-[13rem]";

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
              <RequestActivationButton
                organizationId={organizationId}
                orgSlug={orgSlug}
              />
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
            <RequestActivationButton
              organizationId={organizationId}
              orgSlug={orgSlug}
            />
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
    const showActivation =
      canManage &&
      subscription.activationProgress?.state !== "none" &&
      subscription.activationProgress?.state !== "active";
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
            {showActivation ? (
              <RequestActivationButton
                organizationId={organizationId}
                orgSlug={orgSlug}
              />
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
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function progressFromSubscription(subscription: OrganizationSubscription | null) {
  return (
    subscription?.activationProgress ?? {
      state: "none" as const,
      label: "",
      invoiceId: null,
      canPay: false,
      statusLabel: null,
    }
  );
}

export function RequestActivationButton({
  organizationId,
  orgSlug,
}: {
  organizationId: string;
  orgSlug?: string;
}) {
  const { subscription, refresh } = useSubscription();
  const progress = progressFromSubscription(subscription);
  const [pending, setPending] = useState(false);
  const billingHref = `/app/${orgSlug ?? "workspace"}/settings/billing`;

  if (progress.state === "none") {
    return null;
  }

  if (progress.state === "active") {
    return (
      <Button
        type="button"
        variant="outline"
        className={ACTIVATION_CONTROL_CLASS}
        disabled
        aria-label="Subscription active"
      >
        <Check className="size-3.5" aria-hidden />
        Active
      </Button>
    );
  }

  if (progress.state === "awaiting_verification") {
    return (
      <Button
        type="button"
        variant="outline"
        className={ACTIVATION_CONTROL_CLASS}
        disabled
        aria-label="Payment awaiting verification"
      >
        Payment Awaiting Verification
      </Button>
    );
  }

  if (progress.state === "invoice_preparing") {
    return (
      <Button
        type="button"
        variant="outline"
        className={ACTIVATION_CONTROL_CLASS}
        disabled
        aria-label="Invoice being prepared"
      >
        Invoice Being Prepared
      </Button>
    );
  }

  if (progress.state === "pay_invoice" || progress.state === "view_invoice") {
    return (
      <Button asChild variant="default" className={ACTIVATION_CONTROL_CLASS}>
        <Link href={billingHref}>{progress.label}</Link>
      </Button>
    );
  }

  if (progress.state === "request_sent") {
    return (
      <Button
        type="button"
        variant="outline"
        className={ACTIVATION_CONTROL_CLASS}
        disabled
        aria-label="Activation request sent"
      >
        <Check className="size-3.5" aria-hidden />
        Request Sent
      </Button>
    );
  }

  return (
    <Button
      type="button"
      className={ACTIVATION_CONTROL_CLASS}
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? "Requesting activation" : "Request activation"}
      onClick={async () => {
        if (pending) return;
        setPending(true);
        try {
          const result = await requestActivation(
            organizationId,
            "Please activate this FieldOps Cloud workspace.",
          );
          if (!result.alreadyOpen) {
            toast.success("Activation request sent.");
          }
          await refresh();
        } catch (error) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Could not send the activation request.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Requesting...
        </>
      ) : (
        "Request Activation"
      )}
    </Button>
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
      successLabel="Request Sent"
      toastSuccess="Renewal request sent."
      defaultMessage="Please renew this FieldOps Cloud workspace."
      openRequestType="RENEWAL"
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
      successLabel="Request Sent"
      toastSuccess="Plan change request sent."
      defaultMessage="Please change the plan for this FieldOps Cloud workspace."
      variant={variant}
      openRequestType="PLAN_CHANGE"
    />
  );
}

function CommercialRequestButton({
  organizationId,
  action,
  idleLabel,
  successLabel,
  toastSuccess,
  defaultMessage,
  variant = "default",
  openRequestType,
}: {
  organizationId: string;
  action: (organizationId: string, message?: string) => Promise<{
    alreadyOpen?: boolean;
  }>;
  idleLabel: string;
  successLabel: string;
  toastSuccess: string;
  defaultMessage: string;
  variant?: "default" | "outline";
  openRequestType: "RENEWAL" | "PLAN_CHANGE";
}) {
  const { subscription, refresh } = useSubscription();
  const [pending, setPending] = useState(false);
  const alreadyOpen = Boolean(
    subscription?.openRequests.some(
      (row) =>
        row.requestType === openRequestType &&
        (row.status === "OPEN" || row.status === "CONTACTED"),
    ),
  );

  if (alreadyOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        className={ACTIVATION_CONTROL_CLASS}
        disabled
        aria-label={`${idleLabel} sent`}
      >
        <Check className="size-3.5" aria-hidden />
        {successLabel}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={ACTIVATION_CONTROL_CLASS}
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? `Requesting ${idleLabel}` : idleLabel}
      onClick={async () => {
        if (pending) return;
        setPending(true);
        try {
          const result = await action(organizationId, defaultMessage);
          if (!result?.alreadyOpen) {
            toast.success(toastSuccess);
          }
          await refresh();
        } catch (error) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Could not send the request.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Requesting...
        </>
      ) : (
        idleLabel
      )}
    </Button>
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
