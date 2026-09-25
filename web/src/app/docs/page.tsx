import { DocsSearch } from "@/components/fieldops/docs-search";
import { DocsShell } from "@/components/fieldops/docs-shell";
import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { allCategories, getArticlesByCategory, getArticle } from "@/lib/docs";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation",
  description: "FieldKeel product documentation and help articles.",
};

const POPULAR = [
  "what-is-fieldkeel",
  "trial-onboarding",
  "jobs-overview",
  "teams-technicians-overview",
  "storage-overview",
  "billing-plans",
] as const;

export default function DocsHomePage() {
  const categories = [...allCategories].sort((a, b) => a.order - b.order);

  return (
    <MarketingShell wide>
      <DocsShell home>
        <div className="mx-auto max-w-3xl">
          <p className="type-label text-muted-foreground">Documentation</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            FieldKeel help center
          </h1>
          <p className="mt-3 text-muted-foreground">
            Guides for the features that ship today — workspaces, jobs, crews,
            time, storage, billing, and troubleshooting.
          </p>

          <div className="mt-8">
            <DocsSearch />
          </div>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">Popular topics</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {POPULAR.map((slug) => {
                const article = getArticle(slug);
                if (!article) return null;
                return (
                  <li key={slug}>
                    <Link
                      href={`/docs/${article.slug}`}
                      className="block rounded-lg border border-border bg-workspace/60 px-4 py-3 text-sm hover:border-primary/40"
                    >
                      <span className="font-medium text-foreground">
                        {article.title}
                      </span>
                      <span className="mt-1 block text-muted-foreground">
                        {article.description}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">Browse by product area</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {categories.map((category) => {
                const count = getArticlesByCategory(category.id).length;
                return (
                  <Link
                    key={category.id}
                    href={`/docs/${category.primarySlug}`}
                    className="rounded-lg border border-border bg-workspace/60 px-4 py-4 hover:border-primary/40"
                  >
                    <h3 className="text-sm font-semibold text-foreground">
                      {category.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {category.description}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {count} article{count === 1 ? "" : "s"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </DocsShell>
    </MarketingShell>
  );
}
