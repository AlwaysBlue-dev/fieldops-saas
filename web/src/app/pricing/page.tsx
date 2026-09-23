import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { Button } from "@/components/ui/button";
import {
  catalogPlan,
  getPublicCatalog,
  salesPlan,
} from "@/lib/pricing";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
};

export default async function PricingPage() {
  const catalog = await getPublicCatalog();
  const professional = catalogPlan(catalog, "professional");
  const business = salesPlan(catalog);
  const trialDays = catalog?.trialDays ?? null;
  const supportEmail = catalog?.supportEmail ?? "sales@fieldops.local";

  return (
    <MarketingShell>
      <p className="type-label">Pricing</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        One plan for field operations.
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {trialDays
          ? `Start a Professional workspace with a ${trialDays}-day trial. No credit card required.`
          : "Start a Professional workspace with a free trial. No credit card required."}
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <article className="flex flex-col rounded-lg border border-border bg-card px-5 py-6">
          <h2 className="text-sm font-semibold">
            {professional?.name ?? "FieldOps Cloud Professional"}
          </h2>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight">
              {professional ? professional.priceLabel.split("/")[0] : "—"}
            </span>
            {professional && !professional.contactSales ? (
              <span className="text-sm text-muted-foreground">
                /{professional.priceLabel.split("/")[1] ?? "year"}
              </span>
            ) : null}
          </p>
          <ul className="mt-6 space-y-2.5 text-sm">
            {(professional?.inclusions ?? []).map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-8 h-11">
            <Link href="/signup">Start Free Trial</Link>
          </Button>
        </article>

        <aside className="flex flex-col justify-between gap-6 rounded-lg border border-border px-5 py-6">
          <div>
            <h2 className="text-sm font-semibold">
              {business?.name ?? "Business"}
            </h2>
            <p className="mt-1 text-sm font-medium">Let&apos;s talk</p>
            <p className="mt-2 text-sm text-muted-foreground">
              For larger teams and requirements
              {professional
                ? ` — more than ${professional.includedUsers} users or ${professional.includedStorage}.`
                : "."}{" "}
              Checkout is not online. Activation is handled with our team after
              the trial.
            </p>
          </div>
          <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
            <a href={`mailto:${supportEmail}`}>Contact Sales</a>
          </Button>
        </aside>
      </div>
    </MarketingShell>
  );
}
