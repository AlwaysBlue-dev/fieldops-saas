import { HomeHeroCtas } from "@/components/fieldops/home-hero-ctas";
import { MarketingInstallAppSection } from "@/components/fieldops/marketing-install";
import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { APP_DESCRIPTION, APP_HOME_TITLE, APP_TAGLINE } from "@/lib/brand";
import { catalogPlan, getPublicCatalog } from "@/lib/pricing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: APP_HOME_TITLE },
  description: `${APP_TAGLINE} ${APP_DESCRIPTION}`,
};

export default async function HomePage() {
  const catalog = await getPublicCatalog();
  const professional = catalogPlan(catalog, "professional");
  const trialDays = catalog?.trialDays;
  const trialLabel = trialDays
    ? `Start ${trialDays}-day trial`
    : "Start free trial";
  const pricingLabel = professional
    ? `Professional — ${professional.priceLabel}`
    : "View pricing";

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
        <HomeHeroCtas trialLabel={trialLabel} pricingLabel={pricingLabel} />
        {professional ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {professional.includedUsers} users and {professional.includedStorage}{" "}
            included on Professional.
          </p>
        ) : null}
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

      <MarketingInstallAppSection />
    </MarketingShell>
  );
}
