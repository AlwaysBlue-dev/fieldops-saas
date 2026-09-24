import {
  DocsArticleBody,
  DocsShell,
} from "@/components/fieldops/docs-shell";
import { MarketingShell } from "@/components/fieldops/marketing-shell";
import {
  allArticles,
  getAdjacentArticles,
  getArticle,
  getCategory,
} from "@/lib/docs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Params = { slug: string };

export async function generateStaticParams() {
  return allArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return { title: "Documentation" };
  return { title: article.title, description: article.description };
}

export default async function DocArticlePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const category = getCategory(article.categoryId);
  const adjacent = getAdjacentArticles(slug);
  const tocSections = article.sections.map((section) => ({
    id: section.id,
    heading: section.heading,
  }));

  return (
    <MarketingShell wide>
      <DocsShell
        activeCategoryId={article.categoryId}
        activeArticleSlug={article.slug}
        tocSections={tocSections}
      >
        <DocsArticleBody
          article={article}
          category={category}
          previous={adjacent.previous}
          next={adjacent.next}
        />
      </DocsShell>
    </MarketingShell>
  );
}
