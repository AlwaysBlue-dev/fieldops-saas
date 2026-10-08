import { CompareArticleContent } from "@/components/fieldops/compare-content";
import { JsonLd } from "@/components/fieldops/json-ld";
import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { allComparisons, getComparison } from "@/lib/compare";
import { getPublicCatalog } from "@/lib/pricing";
import { SITE_URL, publicPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams() {
  return allComparisons.map((comparison) => ({ slug: comparison.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getComparison(slug);
  if (!article) return { title: "FieldKeel comparisons" };
  return publicPageMetadata({
    title: article.title,
    description: article.metaDescription,
    path: `/compare/${article.id}`,
  });
}

export default async function CompareArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const article = getComparison(slug);
  if (!article) notFound();
  const catalog = await getPublicCatalog();
  const trialDays = catalog?.trialDays ?? 14;
  const faq = article.sections.find((section) => section.kind === "faq");
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
      { "@type": "ListItem", position: 3, name: article.heading, item: `${SITE_URL}/compare/${article.id}` },
    ],
  };
  const faqPage = faq?.kind === "faq" ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  } : null;

  return (
    <MarketingShell>
      <JsonLd data={breadcrumbs} />
      {faqPage ? <JsonLd data={faqPage} /> : null}
      <CompareArticleContent article={article} trialDays={trialDays} />
    </MarketingShell>
  );
}
