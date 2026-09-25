"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ACTIVATION_UNAVAILABLE_MESSAGE, RENEWAL_UNAVAILABLE_MESSAGE } from "@/lib/subscription";
import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";
import { useSubscription } from "./subscription-provider";

export function useCanMutate() {
  const { subscription, loading } = useSubscription();
  return {
    canMutate: subscription?.canMutate ?? true,
    readOnly: subscription?.readOnly ?? false,
    loading,
    subscription,
  };
}

export function MutationButton({
  children,
  disabled,
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { canMutate, subscription } = useCanMutate();
  const blocked = !canMutate;
  const blockedReason =
    subscription?.effectiveStatus === "EXPIRED" ||
    subscription?.effectiveStatus === "PAID_GRACE"
      ? RENEWAL_UNAVAILABLE_MESSAGE
      : ACTIVATION_UNAVAILABLE_MESSAGE;
  const button = (
    <Button
      {...props}
      className={className}
      disabled={disabled || blocked}
      aria-disabled={disabled || blocked}
    >
      {children}
    </Button>
  );

  if (!blocked) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className?.includes("w-full") && "w-full")}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{blockedReason}</TooltipContent>
    </Tooltip>
  );
}

export function MutationHint({ children }: { children?: ReactNode }) {
  const { readOnly, subscription } = useCanMutate();
  if (!readOnly) return children ?? null;
  const message =
    subscription?.effectiveStatus === "EXPIRED" ||
    subscription?.effectiveStatus === "PAID_GRACE"
      ? RENEWAL_UNAVAILABLE_MESSAGE
      : ACTIVATION_UNAVAILABLE_MESSAGE;
  return <p className="text-xs text-muted-foreground">{message}</p>;
}
