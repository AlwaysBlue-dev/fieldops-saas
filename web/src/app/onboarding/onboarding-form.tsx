"use client";

import { OnboardingWizard } from "@/components/fieldops/onboarding-wizard";
import { Suspense } from "react";

export function OnboardingForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
          Opening workspace…
        </div>
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}
