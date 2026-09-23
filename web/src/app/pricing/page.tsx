import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
};

const plans = [
  {
    name: "Starter",
    price: "Trial",
    detail: "For a first crew evaluating the workspace.",
  },
  {
    name: "Operations",
    price: "Usage-based",
    detail: "Dispatch, time, and approvals for growing field teams.",
  },
  {
    name: "Enterprise",
    price: "Custom",
    detail: "Multi-org, advanced roles, and procurement review.",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <p className="type-label">Pricing</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Start a workspace. Add crews when you need them.
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Billing is not live yet. These tiers describe the commercial shape of
        FieldOps Cloud — start a trial workspace today.
      </p>
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className="flex flex-col rounded-lg border border-border bg-card px-4 py-5"
          >
            <h2 className="text-sm font-semibold">{plan.name}</h2>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
              {plan.price}
            </p>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              {plan.detail}
            </p>
            <Button asChild className="mt-6 h-11">
              <Link href="/signup">Create workspace</Link>
            </Button>
          </article>
        ))}
      </div>
    </MarketingShell>
  );
}
