import { MarketingShell } from "@/components/fieldops/marketing-shell";
import type { LegalVersion, PublicTrust } from "@/lib/trust";

export function LegalDocument({
  title,
  version,
  trust,
  children,
}: {
  title: string;
  version: LegalVersion;
  trust: PublicTrust;
  children: React.ReactNode;
}) {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl">
        <p className="type-label">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Version {version.version}. Effective {version.effectiveDate}. This is a
          product template for legal review, not legal advice.
        </p>
        <div className="legal-prose mt-8 space-y-6 text-sm leading-6 text-foreground">
          {children}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          Questions:{" "}
          <a className="text-primary" href={`mailto:${trust.supportEmail}`}>
            {trust.supportEmail}
          </a>
          {trust.legalEntityName ? ` · ${trust.legalEntityName}` : null}
        </p>
      </article>
    </MarketingShell>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}
