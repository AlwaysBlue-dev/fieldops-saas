import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Documentation" };

export default async function DocumentationPage() {
  const trust = await getPublicTrust();

  return (
    <MarketingShell>
      <p className="type-label">Documentation</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Product documentation
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Use the in-app workspace for operational guides. Public policies live
        here.
      </p>
      <ul className="mt-8 space-y-2 text-sm">
        <li>
          <Link href="/features">Features</Link>
        </li>
        <li>
          <Link href="/pricing">Pricing</Link>
        </li>
        <li>
          <Link href="/billing-policy">Billing & Subscription Policy</Link>
        </li>
        <li>
          <Link href="/trust">Trust Center</Link>
        </li>
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">
        Need help?{" "}
        <a className="text-primary" href={`mailto:${trust.supportEmail}`}>
          {trust.supportEmail}
        </a>
      </p>
    </MarketingShell>
  );
}
