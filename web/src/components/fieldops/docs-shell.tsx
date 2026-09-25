"use client";

import { APP_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { ResponsiveDrawer } from "@/components/fieldops/responsive-drawer";
import {
  allCategories,
  getArticlesByCategory,
  type DocArticle,
  type DocCategory,
} from "@/lib/docs";
import { cn } from "cn";
import { BookOpen, Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * Documentation portal shell.
 * Desktop: left sticky nav + right article (CSS grid via .docs-layout).
 * Large: optional “On this page” TOC.
 * Mobile: Browse drawer; article full width.
 */
export function DocsShell({
  children,
  activeCategoryId = null,
  activeArticleSlug = null,
  tocSections = [],
  home = false,
}: {
  children: ReactNode;
  activeCategoryId?: string | null;
  activeArticleSlug?: string | null;
  tocSections?: { id: string; heading: string }[];
  /** Documentation index: no nested nav scrollbar; fill available height. */
  home?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const categories = [...allCategories].sort((a, b) => a.order - b.order);
  const showToc = tocSections.length > 0 && !home;

  return (
    <div className="w-full">
      <div className="docs-layout-mobile-bar mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="type-label text-muted-foreground">Documentation</p>
          <p className="truncate text-sm font-semibold">{APP_NAME} help</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 gap-2"
          onClick={() => setNavOpen(true)}
        >
          <Menu className="size-4" />
          Browse
        </Button>
      </div>

      <div
        className={cn(
          "docs-layout",
          showToc && "docs-layout--with-toc",
          home && "docs-layout--home",
        )}
      >
        <aside className="docs-layout__nav">
          <div className="docs-layout__nav-inner">
            <div className="rounded-lg border border-border bg-card p-3">
              <DocsNav
                categories={categories}
                activeCategoryId={activeCategoryId}
                activeArticleSlug={activeArticleSlug}
              />
            </div>
          </div>
        </aside>

        <main className="docs-layout__main min-w-0">
          <div className="docs-layout__panel rounded-xl border border-border bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7">
            {children}
          </div>

          {showToc ? (
            <nav
              className="docs-layout__toc-mobile mt-4 rounded-xl border border-border bg-card px-4 py-4"
              aria-label="On this page"
            >
              <p className="type-label text-muted-foreground">On this page</p>
              <ul className="mt-3 space-y-2 text-sm">
                {tocSections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </main>

        {showToc ? (
          <aside className="docs-layout__toc">
            <div className="docs-layout__toc-inner">
              <p className="type-label text-muted-foreground">On this page</p>
              <ul className="mt-3 space-y-2 text-sm">
                {tocSections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}
      </div>

      <ResponsiveDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        title="Documentation"
        description="Browse product guides by area"
      >
        <DocsNav
          categories={categories}
          activeCategoryId={activeCategoryId}
          activeArticleSlug={activeArticleSlug}
          onNavigate={() => setNavOpen(false)}
        />
      </ResponsiveDrawer>
    </div>
  );
}

function DocsNav({
  categories,
  activeCategoryId,
  activeArticleSlug,
  onNavigate,
}: {
  categories: DocCategory[];
  activeCategoryId: string | null | undefined;
  activeArticleSlug: string | null | undefined;
  onNavigate?: () => void;
}) {
  const homeActive = !activeCategoryId && !activeArticleSlug;

  return (
    <nav aria-label="Documentation" className="docs-nav w-full">
      <Link
        href="/docs"
        onClick={onNavigate}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium",
          homeActive
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        )}
      >
        <BookOpen className="size-4 shrink-0" />
        Documentation home
      </Link>

      <p className="mb-1.5 mt-4 px-2 type-label text-muted-foreground">
        Topics
      </p>
      <ul className="flex w-full flex-col gap-0.5">
        {categories.map((category) => {
          const articles = getArticlesByCategory(category.id);
          const categoryActive = activeCategoryId === category.id;
          return (
            <li key={category.id} className="w-full min-w-0">
              <Link
                href={`/docs/${category.primarySlug}`}
                onClick={onNavigate}
                className={cn(
                  "flex w-full rounded-md px-2 py-1.5 text-sm",
                  categoryActive
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <span className="truncate">{category.title}</span>
              </Link>
              {categoryActive && articles.length > 0 ? (
                <ul className="mt-0.5 mb-1.5 ml-2 flex w-[calc(100%-0.5rem)] flex-col gap-0.5 border-l border-border pl-2">
                  {articles.map((article) => {
                    const selected = activeArticleSlug === article.slug;
                    return (
                      <li key={article.slug} className="min-w-0">
                        <Link
                          href={`/docs/${article.slug}`}
                          onClick={onNavigate}
                          className={cn(
                            "flex w-full rounded-md px-2 py-1.5 text-[13px] leading-snug",
                            selected
                              ? "bg-primary/12 font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                          )}
                        >
                          <span className="truncate">{article.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DocsArticleBody({
  article,
  category,
  previous,
  next,
}: {
  article: DocArticle;
  category: DocCategory | null | undefined;
  previous?: DocArticle | null;
  next?: DocArticle | null;
}) {
  return (
    <article className="mx-auto w-full max-w-4xl">
      <p className="type-label text-muted-foreground">
        <Link href="/docs" className="hover:text-foreground hover:underline">
          Documentation
        </Link>
        {category ? (
          <>
            {" / "}
            <Link
              href={`/docs/${category.primarySlug}`}
              className="hover:text-foreground hover:underline"
            >
              {category.title}
            </Link>
          </>
        ) : null}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        {article.title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        {article.description}
      </p>

      <div className="mt-8 space-y-10">
        {article.sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This topic is listed in the help center. Detailed steps will be
            added as the product evolves.
          </p>
        ) : (
          article.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {section.heading}
                </h2>
                <a
                  href={`#${section.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  aria-label={`Link to ${section.heading}`}
                >
                  #
                </a>
              </div>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.7] text-foreground/90">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={`${section.id}-${index}`}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {(previous || next) && (
        <nav
          className="mt-12 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between"
          aria-label="Adjacent articles"
        >
          {previous ? (
            <Link
              href={`/docs/${previous.slug}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="text-sm text-muted-foreground hover:text-foreground sm:text-right"
            >
              {next.title} →
            </Link>
          ) : null}
        </nav>
      )}
    </article>
  );
}
