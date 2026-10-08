import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { JsonLd } from "@/components/fieldops/json-ld";
import { allComparisons } from "@/lib/compare";
import { SITE_URL, publicPageMetadata } from "@/lib/seo";
import Link from "next/link";

export const metadata = publicPageMetadata({
  title: "Compare field service software | FieldKeel",
  description: "Compare FieldKeel with Jobber, Housecall Pro, and ServiceTitan for dispatch, crew coordination, time tracking, pricing, and field operations.",
  path: "/compare",
});

const breadcrumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
  ],
};

export default function CompareIndexPage() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbs} />
      <section className="mx-auto max-w-5xl">
        <p className="type-label">Compare</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Compare FieldKeel</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {allComparisons.map((comparison) => (
            <article key={comparison.id} className="rounded-lg border border-border bg-card px-5 py-5">
              <h2 className="text-lg font-semibold tracking-tight">{comparison.heading}</h2>
              <p className="mt-3 text-sm text-muted-foreground">{comparison.metaDescription}</p>
              <Link href={`/compare/${comparison.id}`} className="mt-5 inline-block text-sm text-primary hover:underline">
                Read comparison
              </Link>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
