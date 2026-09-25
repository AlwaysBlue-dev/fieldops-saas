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

type ProgressState = OrganizationSubscription["activationProgress"]["state"];

function progressState(
  subscription: OrganizationSubscription,
  kind: "activation" | "renewal",
): ProgressState {
  const progress =
    kind === "activation"
      ? subscription.activationProgress
      : subscription.renewalProgress;
  return progress?.state ?? "none";
}

function activationCopy(
  subscription: OrganizationSubscription,
  phase: "trialing" | "grace" | "readonly",
): { title: string; description: string } {
  const state = progressState(subscription, "activation");
  const graceDays = subscription.graceDaysRemaining;
  const trialDays = subscription.trialDaysRemaining;

  if (phase === "trialing") {
    const ends =
      trialDays === 1
        ? "Your trial ends in 1 day."
        : `Your trial ends in ${trialDays} days.`;
    switch (state) {
      case "request_sent":
        return {
          title: ends,
          description:
            "Your activation request has been sent. We'll prepare your invoice before your trial or grace period ends.",
        };
      case "invoice_preparing":
        return {
          title: ends,
          description:
            "Your activation invoice is being prepared. It will appear in Billing when ready.",
        };
      case "pay_invoice":
      case "view_invoice":
        return {
          title: ends,
          description:
            "Your activation invoice is ready. Complete payment before the grace period ends to keep full workspace access.",
        };
      case "awaiting_verification":
        return {
          title: ends,
          description:
            "Your payment is awaiting verification. Your subscription will be activated after payment is confirmed.",
        };
      default:
        return {
          title: ends,
          description:
            "Request activation before your trial ends to avoid read-only access.",
        };
    }
  }

  if (phase === "grace") {
    const title =
      graceDays === 1
        ? "Your trial has ended. Your account will become read-only in 1 day."
        : `Your trial has ended. Your account will become read-only in ${graceDays} days.`;
    switch (state) {
      case "request_sent":
        return {
          title,
          description:
            "Your trial has ended. Your activation request is in progress.",
        };
      case "invoice_preparing":
        return {
          title,
          description:
            "Your activation invoice is being prepared. It will appear in Billing when ready.",
        };
      case "pay_invoice":
      case "view_invoice":
        return {
          title,
          description:
            "Your trial has ended. Complete payment before the grace period ends to keep full workspace access.",
        };
      case "awaiting_verification":
        return {
          title,
          description:
            "Your payment is awaiting verification. Your subscription will be activated after payment is confirmed.",
        };
      default:
        return {
          title,
          description:
            "Your trial has ended. Request activation before the grace period ends to avoid read-only access.",
        };
    }
  }

  // readonly / trial expired
  const title =
    "Your workspace is read-only until the subscription is activated.";
  switch (state) {
    case "request_sent":
      return {
        title,
        description:
          "Your activation request is in progress. Billing and documentation stay available.",
      };
    case "invoice_preparing":
      return {
        title,
        description:
          "Your activation invoice is being prepared. It will appear in Billing when ready.",
      };
    case "pay_invoice":
    case "view_invoice":
      return {
        title,
        description:
          "Complete payment from Billing to restore full workspace access.",
      };
    case "awaiting_verification":
      return {
        title,
        description:
          "Your payment is awaiting verification. Your subscription will be activated after payment is confirmed.",
      };
    default:
      return {
        title,
        description:
          "Request activation from this banner or Plan & Subscription. Billing stays available.",
      };
  }
}

function renewalCopy(
  subscription: OrganizationSubscription,
  phase: "upcoming" | "paid_grace" | "readonly",
): { title: string; description: string } {
  const state = progressState(subscription, "renewal");
  const days = subscription.daysUntilExpiration;
  const graceDays = subscription.graceDaysRemaining;

  if (phase === "upcoming") {
    const title =
      days === 1
        ? "Your subscription renews in 1 day."
        : `Your subscription renews in ${days} days.`;
    switch (state) {
      case "request_sent":
        return {
          title,
          description:
            "Your renewal request has been sent. Your renewal invoice will be available in Billing.",
        };
      case "invoice_preparing":
        return {
          title,
          description:
            "Your renewal invoice is being prepared. It will appear in Billing when ready.",
        };
      case "pay_invoice":
      case "view_invoice":
        return {
          title,
          description:
            "Your renewal invoice is ready. Complete payment before the renewal grace period ends to keep full access.",
        };
      case "awaiting_verification":
        return {
          title,
          description: "Your renewal payment is awaiting verification.",
        };
      default:
        return {
          title,
          description:
            "Your subscription renews soon. Your renewal invoice will be available in Billing.",
        };
    }
  }

  if (phase === "paid_grace") {
    const title =
      graceDays === 1
        ? "Your FieldOps Cloud subscription has expired. Renew within 1 day to avoid your workspace becoming read-only."
        : `Your FieldOps Cloud subscription has expired. Renew within ${graceDays} days to avoid your workspace becoming read-only.`;
    switch (state) {
      case "request_sent":
        return {
          title,
          description:
            "Your renewal request is in progress. Existing work continues for now.",
        };
      case "invoice_preparing":
        return {
          title,
          description:
            "Your renewal invoice is being prepared. It will appear in Billing when ready.",
        };
      case "pay_invoice":
      case "view_invoice":
        return {
          title,
          description:
            "Your renewal invoice is ready. Complete payment before the renewal grace period ends to keep full access.",
        };
      case "awaiting_verification":
        return {
          title,
          description: "Your renewal payment is awaiting verification.",
        };
      default:
        return {
          title,
          description:
            "Request renewal or open Billing when your invoice is ready. Existing work continues for now.",
        };
    }
  }

  const title =
    "Your workspace is read-only until the subscription is renewed.";
  switch (state) {
    case "request_sent":
      return {
        title,
        description:
          "Your renewal request is in progress. Billing stays available.",
      };
    case "invoice_preparing":
      return {
        title,
        description:
          "Your renewal invoice is being prepared. It will appear in Billing when ready.",
      };
    case "pay_invoice":
    case "view_invoice":
      return {
        title,
        description:
          "Complete payment from Billing to restore full workspace access.",
      };
    case "awaiting_verification":
      return {
        title,
        description: "Your renewal payment is awaiting verification.",
      };
    default:
      return {
        title,
        description:
          "Request renewal from this banner or Plan & Subscription. Billing stays available.",
      };
  }
}

function shouldShowTrialWarning(subscription: OrganizationSubscription) {
  const state = progressState(subscription, "activation");
  if (
    state === "request_sent" ||
    state === "invoice_preparing" ||
    state === "pay_invoice" ||
    state === "view_invoice" ||
    state === "awaiting_verification"
  ) {
    return true;
  }
  return isTrialEndingSoon(subscription);
}

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
    if (shouldShowTrialWarning(subscription)) {
      const copy = activationCopy(subscription, "trialing");
      return (
        <Banner
          tone="warning"
          title={copy.title}
          description={copy.description}
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
    const copy = activationCopy(subscription, "grace");
    return (
      <Banner
        tone="warning"
        title={copy.title}
        description={copy.description}
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
    const copy = renewalCopy(subscription, "paid_grace");
    return (
      <Banner
        tone="warning"
        title={copy.title}
        description={copy.description}
        action={
          canManage ? (
            <RenewalActionButton
              organizationId={organizationId}
              orgSlug={orgSlug}
            />
          ) : null
        }
      />
    );
  }

  if (subscription.effectiveStatus === "ACTIVE" && isNearExpiry(subscription)) {
    const copy = renewalCopy(subscription, "upcoming");
    return (
      <Banner
        tone="warning"
        title={copy.title}
        description={copy.description}
        action={
          canManage ? (
            <RenewalActionButton
              organizationId={organizationId}
              orgSlug={orgSlug}
              preferRequestLabel="Renew Subscription"
            />
          ) : null
        }
      />
    );
  }

  if (subscription.effectiveStatus === "TRIAL_EXPIRED") {
    const copy = activationCopy(subscription, "readonly");
    return (
      <Banner
        tone="critical"
        title={copy.title}
        description={
          canManage
            ? copy.description
            : "An owner or admin can complete activation. Existing records stay visible."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <RequestActivationButton
                organizationId={organizationId}
                orgSlug={orgSlug}
              />
            ) : null}
            <Button asChild variant="outline" className="h-9 md:h-8">
              <Link href={`/app/${orgSlug}/settings/billing`}>Billing</Link>
            </Button>
          </div>
        }
      />
    );
  }

  if (subscription.effectiveStatus === "EXPIRED") {
    const copy = renewalCopy(subscription, "readonly");
    return (
      <Banner
        tone="critical"
        title={copy.title}
        description={
          canManage
            ? copy.description
            : "An owner or admin can complete renewal. Existing records stay visible."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <RenewalActionButton
                organizationId={organizationId}
                orgSlug={orgSlug}
              />
            ) : null}
            <Button asChild variant="outline" className="h-9 md:h-8">
              <Link href={`/app/${orgSlug}/settings/billing`}>Billing</Link>
            </Button>
          </div>
        }
      />
    );
  }

  if (
    subscription.effectiveStatus === "SUSPENDED" ||
    subscription.effectiveStatus === "CANCELLED"
  ) {
    const title =
      subscription.effectiveStatus === "SUSPENDED"
        ? "This workspace is suspended and read-only."
        : "This workspace subscription is cancelled and read-only.";
    return (
      <Banner
        tone="critical"
        title={title}
        description={
          canManage
            ? "Open Plan & Subscription or Billing for next steps. Existing records stay visible."
            : "An owner or admin can restore this workspace. Existing records stay visible."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-9 md:h-8">
              <Link href={`/app/${orgSlug}/settings`}>Plan & Subscription</Link>
            </Button>
            <Button asChild variant="outline" className="h-9 md:h-8">
              <Link href={`/app/${orgSlug}/settings/billing`}>Billing</Link>
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

function progressFromSubscription(
  subscription: OrganizationSubscription | null,
  kind: "activation" | "renewal" = "activation",
) {
  const empty = {
    state: "none" as const,
    label: "",
    invoiceId: null,
    canPay: false,
    statusLabel: null,
  };
  if (!subscription) return empty;
  return (
    (kind === "activation"
      ? subscription.activationProgress
      : subscription.renewalProgress) ?? empty
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
  const progress = progressFromSubscription(subscription, "activation");
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

export function RenewalActionButton({
  organizationId,
  orgSlug,
  preferRequestLabel = "Request Renewal",
}: {
  organizationId: string;
  orgSlug: string;
  preferRequestLabel?: string;
}) {
  const { subscription } = useSubscription();
  const progress = progressFromSubscription(subscription, "renewal");
  const billingHref = `/app/${orgSlug}/settings/billing`;

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
        aria-label="Renewal request sent"
      >
        <Check className="size-3.5" aria-hidden />
        Request Sent
      </Button>
    );
  }

  return (
    <RequestRenewalButton
      organizationId={organizationId}
      label={preferRequestLabel}
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
  action: (
    organizationId: string,
    message?: string,
  ) => Promise<{
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
