import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { JsonLd } from "@/components/fieldops/json-ld";
import { CompareLinkRow } from "@/components/fieldops/compare-link-row";
import { Button } from "@/components/ui/button";
import {
  annualPriceParts,
  catalogPlan,
  getPublicCatalog,
  multiYearPriceCents,
  MULTI_YEAR_TERM_DISCOUNTS,
  type PublicPlan,
} from "@/lib/pricing";
import { FIELDKEEL_SUPPORT_EMAIL } from "@/lib/brand";
import Link from "next/link";
import { publicPageMetadata, softwareApplicationJsonLd } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "FieldKeel pricing plans",
  description: "Compare FieldKeel Starter, Professional, and Business plans, including annual pricing, user capacity, storage, and trial details.",
  path: "/pricing",
});

function CheckItem({ children }: { children: string }) {
  return (
    <li className="flex gap-2 text-sm">
      <span className="mt-0.5 shrink-0 text-primary" aria-hidden>
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function PricingCard({
  plan,
  supportEmail,
  emphasized,
}: {
  plan: PublicPlan;
  supportEmail: string;
  emphasized?: boolean;
}) {
  const price = annualPriceParts(plan);
  const highlights = (
    plan.highlights?.length > 0 ? plan.highlights : plan.inclusions
  ).filter((item) => !/advanced reports|advanced branding|^approvals$/i.test(item));

  return (
    <article
      className={[
        "relative flex h-full flex-col rounded-lg border bg-card px-5 py-6",
        emphasized
          ? "border-primary shadow-sm ring-1 ring-primary/20"
          : "border-border",
      ].join(" ")}
    >
      {plan.badge ? (
        <p className="absolute -top-3 left-5 rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium tracking-wide text-primary-foreground">
          {plan.badge}
        </p>
      ) : null}
      <h2 className="text-base font-semibold tracking-tight">{plan.name}</h2>
      {plan.positioning ? (
        <p className="mt-1 text-sm text-muted-foreground">{plan.positioning}</p>
      ) : null}
      <p className="mt-5 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight">
          {price.amount}
        </span>
        {price.period ? (
          <span className="text-sm text-muted-foreground">/{price.period}</span>
        ) : null}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Up to {plan.includedUsers} users
        <span className="mx-1.5 text-border">·</span>
        {plan.includedStorage} storage
      </p>
      <ul className="mt-6 flex flex-1 flex-col gap-2.5">
        {highlights.map((item) => (
          <CheckItem key={item}>{item}</CheckItem>
        ))}
      </ul>
      {plan.contactSales ? (
        <Button asChild variant="outline" className="mt-8 h-11 w-full">
          <a href={`mailto:${supportEmail}`}>Contact Sales</a>
        </Button>
      ) : (
        <Button asChild className="mt-8 h-11 w-full">
          <Link href="/signup">Start Free Trial</Link>
        </Button>
      )}
    </article>
  );
}

function CellYes() {
  return <span className="text-foreground">Yes</span>;
}

function CellNo() {
  return <span className="text-muted-foreground">No</span>;
}

function ComparisonSection({ plans }: { plans: PublicPlan[] }) {
  const starter = plans.find((p) => p.code === "starter");
  const professional = plans.find((p) => p.code === "professional");
  const business = plans.find((p) => p.code === "business");
  if (!starter || !professional || !business) return null;

  const columns = [starter, professional, business];

  const rows: {
    label: string;
    values: (string | "yes" | "no")[];
  }[] = [
    {
      label: "Users",
      values: columns.map((p) =>
        p.code === "business" ? `Up to ${p.includedUsers}` : String(p.includedUsers),
      ),
    },
    {
      label: "Storage",
      values: columns.map((p) => p.includedStorage),
    },
    {
      label: "Jobs & Work Orders",
      values: columns.map((p) => (p.featureFlags.JOBS ? "yes" : "no")),
    },
    {
      label: "Scheduling & Dispatch",
      values: columns.map((p) => (p.featureFlags.JOBS ? "yes" : "no")),
    },
    {
      label: "Timesheets",
      values: columns.map((p) => (p.featureFlags.TIMESHEETS ? "yes" : "no")),
    },
    {
      label: "GPS Clock Events",
      values: columns.map((p) => (p.featureFlags.GPS ? "yes" : "no")),
    },
    {
      label: "Client Signatures",
      values: columns.map((p) =>
        p.featureFlags.CLIENT_SIGNATURE ? "yes" : "no",
      ),
    },
    {
      label: "Reports",
      values: ["yes", "yes", "yes"],
    },
    {
      label: "Approvals",
      values: ["yes", "yes", "yes"],
    },
    {
      label: "Organization Branding",
       values: ["yes", "yes", "yes"],
    },
  ];

  return (
    <section className="mt-16">
      <h2 className="text-xl font-semibold tracking-tight">Compare plans</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Limits and features come from the live plan catalog. Organization logo
        uploads are included with Professional and Business.
      </p>

      {/* Mobile: stacked plan summaries */}
      <div className="mt-6 space-y-4 md:hidden">
        {columns.map((plan) => (
          <div
            key={plan.code}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <p className="text-sm font-semibold">{plan.name}</p>
            <dl className="mt-3 space-y-2 text-sm">
              {rows.map((row) => {
                const idx = columns.indexOf(plan);
                const value = row.values[idx];
                return (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="text-right font-medium">
                      {value === "yes" ? (
                        <CellYes />
                      ) : value === "no" ? (
                        <CellNo />
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>

      {/* Desktop / tablet table */}
      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full min-w-xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 pr-4 font-medium text-muted-foreground">
                Feature
              </th>
              {columns.map((plan) => (
                <th key={plan.code} className="px-3 py-3 font-semibold">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/70">
                <th className="py-3 pr-4 text-left font-medium text-muted-foreground">
                  {row.label}
                </th>
                {row.values.map((value, i) => (
                  <td key={`${row.label}-${columns[i].code}`} className="px-3 py-3">
                    {value === "yes" ? (
                      <CellYes />
                    ) : value === "no" ? (
                      <CellNo />
                    ) : (
                      value
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MultiYearPricing({ plans }: { plans: PublicPlan[] }) {
  const starter = plans.find((plan) => plan.code === "starter");
  const professional = plans.find((plan) => plan.code === "professional");
  if (!starter?.annualPriceCents || !professional?.annualPriceCents) return null;
  const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  }).format(cents / 100);

  return (
    <section className="mt-12 rounded-lg border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight">Save when you prepay for multiple years</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Choose a 1–5 year term when paying an issued Starter or Professional invoice. The full term is charged upfront; Paddle renews automatically at the end of that term unless you cancel.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead><tr className="border-b border-border text-muted-foreground"><th className="py-2 pr-4 font-medium">Prepay term</th><th className="px-3 py-2 font-medium">Starter</th><th className="px-3 py-2 font-medium">Professional</th></tr></thead>
          <tbody>
            {MULTI_YEAR_TERM_DISCOUNTS.map((discount, index) => {
              const years = index + 1;
              const starterTotal = multiYearPriceCents(starter.annualPriceCents!, years)!;
              const professionalTotal = multiYearPriceCents(professional.annualPriceCents!, years)!;
              return (
                <tr key={years} className="border-b border-border/70 last:border-0">
                  <th className="py-3 pr-4 font-medium">{years} {years === 1 ? "year" : "years"}{discount ? <span className="block text-xs font-normal text-muted-foreground">Save {discount}%</span> : null}</th>
                  <td className="px-3 py-3">{money(starterTotal)} total</td>
                  <td className="px-3 py-3">{money(professionalTotal)} total</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: "How do I pay for FieldKeel?",
    a: "Pay by card through Paddle for 1–5 years upfront. Multi-year terms receive 5% off for 2 years, 7% for 3 years, 10% for 4 years, and 15% for 5 years. The subscription renews at the end of the selected term unless canceled. Manual invoices remain available for the invoice period shown.",
  },
  {
    q: "Do you automatically charge my card?",
    a: "The no-card Professional trial never automatically charges you. When paying an issued Starter or Professional invoice by card, choose 1–5 years and pay the full term upfront. Paddle renews at the end of that term unless you cancel. Manual invoice payments do not auto-renew.",
  },
  {
    q: "What happens after I pay?",
    a: "Your payment is verified and your subscription is activated or renewed. You'll receive confirmation once complete.",
  },
  {
    q: "What happens after the trial?",
    a: "Your Professional trial does not require a card and will not auto-charge. In Billing, pay an issued invoice by card or manual invoice. Your subscription changes only after Paddle confirms card payment or FieldKeel verifies the manual payment.",
  },
  {
    q: "Do I need a credit card for the trial?",
    a: "No. The trial does not require a credit card.",
  },
  {
    q: "Can I create more than one workspace?",
    a: "Yes. A FieldKeel account can manage multiple organizations. Each organization has its own subscription, users, storage, and billing.",
  },
  {
    q: "Do I get a free trial for every workspace?",
    a: "No. Each verified FieldKeel account receives one 14-day Professional trial. Additional workspaces require their own subscription.",
  },
  {
    q: "Does joining another organization use my free trial?",
    a: "No. Accepting an invitation to another organization does not consume your personal free-trial eligibility.",
  },
  {
    q: "Can I delete my trial workspace and start another free trial?",
    a: "No. The free trial is available once per verified account.",
  },
  {
    q: "Can I change plan later?",
    a: "Contact FieldKeel to arrange a plan change. An issued Starter or Professional invoice can be paid by card or manual invoice; Business remains Contact Sales.",
  },
  {
    q: "What happens if I exceed users or storage?",
    a: "New seats and uploads that would exceed your plan limits are blocked until you free capacity or upgrade. Existing data remains available.",
  },
  {
    q: "What is Business?",
    a: "Business is for larger operations with higher user and storage limits and custom commercial requirements. Contact sales for a quote.",
  },
] as const;

export default async function PricingPage() {
  const catalog = await getPublicCatalog();
  const plans = catalog?.plans ?? [];
  const professional = catalogPlan(catalog, "professional");
  const trialDays = catalog?.trialDays ?? 14;
  const supportEmail = catalog?.supportEmail ?? FIELDKEEL_SUPPORT_EMAIL;
  const trialPlanName = professional?.name ?? "Professional";

  return (
    <MarketingShell>
      <JsonLd data={softwareApplicationJsonLd(catalog)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <p className="type-label">Pricing</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Simple annual plans for field operations.
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        One {trialDays}-day {trialPlanName} trial per verified account. No
        credit card required.
      </p>

      {plans.length > 0 ? (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              supportEmail={supportEmail}
              emphasized={plan.code === "professional"}
            />
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-lg border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
          Pricing is unavailable right now. Try again shortly, or{" "}
          <a className="text-primary underline-offset-2 hover:underline" href={`mailto:${supportEmail}`}>
            contact sales
          </a>
          .
        </p>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Paid subscriptions are activated through an official FieldKeel invoice.
        We do not currently collect card details in the app. See the{" "}
        <Link
          href="/billing-policy"
          className="text-foreground underline-offset-2 hover:underline"
        >
          Billing Policy
        </Link>
        .
      </p>

      <ComparisonSection plans={plans} />
      <MultiYearPricing plans={plans} />

      <section className="mt-16 max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight">FAQ</h2>
        <dl className="mt-6 space-y-5">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-semibold">{item.q}</dt>
              <dd className="mt-1.5 text-sm text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <CompareLinkRow className="mt-8" />
    </MarketingShell>
  );
}
