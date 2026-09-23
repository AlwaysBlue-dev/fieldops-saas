import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Trust Center" };

const sections = [
  {
    title: "Security",
    copy: "Session cookies, password hashing, tenant isolation, audit logs, and role checks. No invented certifications.",
    href: "/security",
  },
  {
    title: "Privacy",
    copy: "Account, organization, job, evidence, and GPS-on-clock data, used to operate the workspace.",
    href: "/privacy",
  },
  {
    title: "Data protection",
    copy: "Organization-scoped records, private object storage, and authorized file access.",
    href: "/security",
  },
  {
    title: "Account security",
    copy: "Owners control invitations and roles. We never ask for passwords or card numbers by email or chat.",
    href: "/security",
  },
  {
    title: "Location / GPS privacy",
    copy: "Location is captured only during explicit clock-in or clock-out. No continuous background tracking in this product.",
    href: "/privacy",
  },
  {
    title: "Subscription transparency",
    copy: "Manual invoices, authenticated payment instructions, and explicit activation after payment is confirmed.",
    href: "/billing-policy",
  },
];

export default async function TrustPage() {
  const trust = await getPublicTrust();

  return (
    <MarketingShell>
      <p className="type-label">Trust</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        How FieldOps Cloud handles trust.
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Clear policies for security, privacy, billing, and acceptable use. This
        center describes the current product. It does not list certifications
        that have not been obtained.
      </p>

      <div className="mt-10 grid gap-3 md:grid-cols-2">
        {sections.map((item) => (
          <article
            key={item.title}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <h2 className="text-sm font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{item.copy}</p>
            <Link href={item.href} className="mt-3 inline-block text-sm text-primary">
              Read more
            </Link>
          </article>
        ))}
      </div>

      <section className="mt-10 rounded-lg border border-border px-4 py-4">
        <h2 className="text-sm font-semibold">Support and security contact</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Support:{" "}
          <a className="text-primary" href={`mailto:${trust.supportEmail}`}>
            {trust.supportEmail}
          </a>
          . Sales:{" "}
          <a className="text-primary" href={`mailto:${trust.salesEmail}`}>
            {trust.salesEmail}
          </a>
          . Security:{" "}
          <a className="text-primary" href={`mailto:${trust.securityEmail}`}>
            {trust.securityEmail}
          </a>
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/security">Security</Link>
          <Link href="/billing-policy">Billing Policy</Link>
          <Link href="/acceptable-use">Acceptable Use</Link>
          <Link href="/documentation">Documentation</Link>
          <Link href="/support">Support</Link>
        </div>
      </section>
    </MarketingShell>
  );
}
