import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_HOME_TITLE, APP_TAGLINE } from "@/lib/brand";
import { catalogPlan, getPublicCatalog } from "@/lib/pricing";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: APP_HOME_TITLE },
  description: `${APP_TAGLINE} ${APP_DESCRIPTION}`,
};

export default async function HomePage() {
  const catalog = await getPublicCatalog();
  const professional = catalogPlan(catalog, "professional");
  const trialDays = catalog?.trialDays;

  return (
    <MarketingShell>
      <section className="max-w-2xl">
        <p className="text-3xl font-semibold tracking-tight md:text-5xl">
          {APP_HOME_TITLE}
        </p>
        <h1 className="mt-3 text-xl font-medium tracking-tight text-foreground md:text-2xl">
          {APP_TAGLINE}
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
          FieldKeel is a field service and operations management platform that
          keeps dispatch, crews, time, and approvals in a single workspace —
          dense on desktop, app-like in the field.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="h-11 px-4">
            <Link href="/signup">
              {trialDays ? `Start ${trialDays}-day trial` : "Start free trial"}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 px-4">
            <Link href="/pricing">
              {professional
                ? `Professional — ${professional.priceLabel}`
                : "View pricing"}
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          No credit card required
          {professional
            ? `. ${professional.includedUsers} users and ${professional.includedStorage} included.`
            : "."}
        </p>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Dispatch board",
            copy: "See today’s work, crews in field, and jobs that need a decision.",
          },
          {
            title: "Field-ready mobile",
            copy: "Bottom navigation, large targets, and keyboard-safe forms on a phone.",
          },
          {
            title: "Approvals and time",
            copy: "Clock sessions and review queues stay next to the jobs they belong to.",
          },
        ].map((item) => (
          <article
            key={item.title}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <h2 className="text-sm font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{item.copy}</p>
          </article>
        ))}
      </section>
    </MarketingShell>
  );
}
