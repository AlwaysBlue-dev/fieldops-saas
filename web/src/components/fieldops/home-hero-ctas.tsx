"use client";

import {
  MarketingHeroAuthCta,
  marketingHeroSupportCopy,
  useMarketingAuth,
} from "@/components/fieldops/marketing-auth-actions";
import { MarketingAppCapabilityBadge } from "@/components/fieldops/marketing-install";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function HomeHeroCtas({
  trialLabel,
  pricingLabel,
}: {
  trialLabel: string;
  pricingLabel: string;
}) {
  const kind = useMarketingAuth();
  const support = marketingHeroSupportCopy(kind);

  return (
    <>
      <MarketingAppCapabilityBadge />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <MarketingHeroAuthCta trialLabel={trialLabel} />
        <Button asChild variant="outline" className="h-11 px-4">
          <Link href="/pricing">{pricingLabel}</Link>
        </Button>
      </div>
      {kind === "anonymous" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No credit card required
        </p>
      ) : support ? (
        <p className="mt-3 text-sm text-muted-foreground">{support}</p>
      ) : null}
    </>
  );
}
