import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { Button } from "@/components/ui/button";
import {
  annualPriceParts,
  catalogPlan,
  getPublicCatalog,
  type PublicPlan,
} from "@/lib/pricing";
import { FIELDKEEL_SUPPORT_EMAIL } from "@/lib/brand";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
};

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
  const highlights =
    plan.highlights?.length > 0 ? plan.highlights : plan.inclusions;

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
      label: "Jobs",
      values: columns.map((p) => (p.featureFlags.JOBS ? "yes" : "no")),
    },
    {
      label: "Scheduling",
      values: columns.map((p) => (p.featureFlags.JOBS ? "yes" : "no")),
    },
    {
      label: "Timesheets",
      values: columns.map((p) => (p.featureFlags.TIMESHEETS ? "yes" : "no")),
    },
    {
      label: "GPS",
      values: columns.map((p) => (p.featureFlags.GPS ? "yes" : "no")),
    },
    {
      label: "Client Signatures",
      values: columns.map((p) =>
        p.featureFlags.CLIENT_SIGNATURE ? "yes" : "no",
      ),
    },
    {
      label: "Basic Reports",
      values: ["yes", "yes", "yes"],
    },
    {
      label: "Advanced Reports",
      values: columns.map((p) =>
        p.featureFlags.ADVANCED_REPORTS ? "yes" : "no",
      ),
    },
    {
      label: "Approvals",
      values: columns.map((p) => (p.featureFlags.APPROVALS ? "yes" : "no")),
    },
    {
      label: "Organization Branding",
      values: columns.map((p) =>
        p.featureFlags.CUSTOM_BRANDING ? "yes" : "no",
      ),
    },
    {
      label: "Advanced Branding",
      values: columns.map((p) =>
        p.featureFlags.ADVANCED_BRANDING ? "yes" : "no",
      ),
    },
  ];

  return (
    <section className="mt-16">
      <h2 className="text-xl font-semibold tracking-tight">Compare plans</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Limits and features come from the live plan catalog.
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

const FAQ_ITEMS = [
  {
    q: "How do I pay for FieldKeel?",
    a: "When your subscription invoice is ready, a secure payment link will appear in Billing. Payments are confirmed before your subscription is activated or renewed.",
  },
  {
    q: "Do you automatically charge my card?",
    a: "No. FieldKeel does not currently automatically charge a stored card.",
  },
  {
    q: "What happens after I pay?",
    a: "Your payment is verified and your subscription is activated or renewed. You'll receive confirmation once complete.",
  },
  {
    q: "What happens after the trial?",
    a: "An activation invoice becomes available in Billing before your trial or grace period ends. After payment is confirmed, your paid subscription is activated.",
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
    a: "Yes. Owners and admins can submit a plan-change request from billing. FieldKeel handles the commercial change with an invoice when needed — there is no self-serve checkout that charges a card automatically.",
  },
  {
    q: "What happens if I exceed users or storage?",
    a: "New seats and uploads that would exceed your plan limits are blocked until you free capacity or upgrade. Existing data remains available.",
  },
  {
    q: "What is Business?",
    a: "Business is for larger teams and custom commercial requirements — higher seat and storage limits, advanced branding options, and sales-assisted onboarding. Contact sales for a quote.",
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
    </MarketingShell>
  );
}
