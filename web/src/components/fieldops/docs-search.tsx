"use client";

import { Input } from "@/components/ui/input";
import { searchArticles } from "@/lib/docs";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

export function DocsSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const results = useMemo(
    () => (deferred.trim() ? searchArticles(deferred).slice(0, 20) : []),
    [deferred],
  );

  return (
    <div>
      <label htmlFor="docs-search" className="sr-only">
        Search documentation
      </label>
      <Input
        id="docs-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search documentation…"
        className="h-11"
        autoComplete="off"
      />
      {deferred.trim() ? (
        <ul className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-border bg-card">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No matching articles.
            </li>
          ) : (
            results.map((article) => (
              <li key={article.slug} className="border-b border-border last:border-0">
                <Link
                  href={`/docs/${article.slug}`}
                  className="block px-4 py-3 text-sm hover:bg-muted/40"
                >
                  <span className="font-medium">{article.title}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {article.description}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
