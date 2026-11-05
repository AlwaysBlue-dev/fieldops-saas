import { HomeHeroCtas } from "@/components/fieldops/home-hero-ctas";
import { MarketingInstallAppSection } from "@/components/fieldops/marketing-install";
import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { JsonLd } from "@/components/fieldops/json-ld";
import { CompareLinkRow } from "@/components/fieldops/compare-link-row";
import { APP_HOME_TITLE, APP_TAGLINE } from "@/lib/brand";
import { catalogPlan, getPublicCatalog } from "@/lib/pricing";
import { publicPageMetadata, softwareApplicationJsonLd } from "@/lib/seo";
import Link from "next/link";

export const metadata = publicPageMetadata({
  title: "Field service management software | FieldKeel",
  description: `${APP_TAGLINE} FieldKeel keeps dispatch, crews, time, and approvals in one workspace. Professional and Business include AI Workforce for authorized lookups and propose-then-approve changes.`,
  path: "/",
});

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
      <JsonLd data={softwareApplicationJsonLd(catalog)} />
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
            copy: "Prepare assigned jobs for offline work, then sync when coverage returns. Large targets and keyboard-safe forms on a phone.",
          },
          {
            title: "Access before arrival",
            copy: "Spot missing site access notes or contacts early—so crews are less likely to waste a site visit.",
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

      <section className="mt-10 max-w-3xl rounded-lg border border-border bg-card px-4 py-5 sm:px-5">
        <h2 className="text-sm font-semibold">AI Workforce</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask questions in plain language about jobs, schedules, and missing
          site access. It can also propose allow-listed changes (jobs, clients,
          sites, teams) that stay pending until an owner, admin, or operations
          manager Approves them. Included on Professional and Business plans.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link
            href="/features"
            className="font-medium text-primary hover:underline"
          >
            See features
          </Link>
          <Link
            href="/pricing"
            className="font-medium text-primary hover:underline"
          >
            View pricing
          </Link>
          <Link
            href="/docs/ai-workforce-overview"
            className="font-medium text-primary hover:underline"
          >
            Read the AI Workforce guide
          </Link>
        </p>
      </section>

      <CompareLinkRow className="mt-5" />
      <MarketingInstallAppSection />
    </MarketingShell>
  );
}
