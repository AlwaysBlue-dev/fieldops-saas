import { DocsShell } from "@/components/fieldops/docs-shell";
import { MarketingShell } from "@/components/fieldops/marketing-shell";
import {
  allCategories,
  getArticlesByCategory,
  getCategory,
  getPrimaryArticle,
} from "@/lib/docs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type Params = { categoryId: string };

export async function generateStaticParams() {
  return allCategories.map((category) => ({ categoryId: category.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { categoryId } = await params;
  const category = getCategory(categoryId);
  if (!category) return { title: "Documentation" };
  return { title: category.title, description: category.description };
}

/**
 * Category URLs redirect to the primary article so the main panel always
 * shows full article content. Multi-article categories keep related links
 * in the left nav under the active topic.
 */
export default async function DocCategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { categoryId } = await params;
  const category = getCategory(categoryId);
  if (!category) notFound();

  const primary = getPrimaryArticle(categoryId);
  if (primary) {
    redirect(`/docs/${primary.slug}`);
  }

  // Fallback landing if a category somehow has no articles yet.
  const articles = getArticlesByCategory(categoryId);
  return (
    <MarketingShell wide>
      <DocsShell activeCategoryId={category.id}>
        <div className="mx-auto max-w-3xl">
          <p className="type-label text-muted-foreground">
            <Link href="/docs" className="hover:underline">
              Documentation
            </Link>
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {category.title}
          </h1>
          <p className="mt-3 text-muted-foreground">{category.description}</p>
          {articles.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">
              Articles for this topic are being prepared.
            </p>
          ) : (
            <ul className="mt-8 space-y-3">
              {articles.map((article) => (
                <li key={article.slug}>
                  <Link
                    href={`/docs/${article.slug}`}
                    className="block rounded-lg border border-border bg-workspace/60 px-4 py-4 hover:border-primary/40"
                  >
                    <span className="text-sm font-semibold">{article.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {article.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DocsShell>
    </MarketingShell>
  );
}
