import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const trust = await getPublicTrust();

  return (
    <MarketingShell>
      <p className="type-label">Support</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Talk to FieldOps
      </h1>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {[
          { title: "Support", email: trust.supportEmail, copy: "Product usage, account help, and defects." },
          { title: "Sales", email: trust.salesEmail, copy: "Activation, renewal, and Business conversations." },
          { title: "Security", email: trust.securityEmail, copy: "Vulnerability and security reports." },
        ].map((item) => (
          <article key={item.title} className="rounded-lg border border-border bg-card px-4 py-4">
            <h2 className="text-sm font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{item.copy}</p>
            <a className="mt-3 inline-block text-sm text-primary" href={`mailto:${item.email}`}>
              {item.email}
            </a>
          </article>
        ))}
      </div>
      <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
        FieldOps Cloud will never ask you to provide your password, full card
        number, CVV, or authentication credentials by email, support message, or
        chat. Verify unexpected payment instructions through{" "}
        <Link href="/billing-policy">Billing Policy</Link> and Support.
      </p>
    </MarketingShell>
  );
}
