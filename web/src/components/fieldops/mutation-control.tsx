"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ACTIVATION_UNAVAILABLE_MESSAGE } from "@/lib/subscription";
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
  const { canMutate } = useCanMutate();
  const blocked = !canMutate;
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
      <TooltipContent>{ACTIVATION_UNAVAILABLE_MESSAGE}</TooltipContent>
    </Tooltip>
  );
}

export function MutationHint({ children }: { children?: ReactNode }) {
  const { readOnly } = useCanMutate();
  if (!readOnly) return children ?? null;
  return (
    <p className="text-xs text-muted-foreground">
      {ACTIVATION_UNAVAILABLE_MESSAGE}
    </p>
  );
}
