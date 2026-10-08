import type { CompareArticle, CompareBlock } from "@/lib/compare";
import { MarketingHeroAuthCta } from "@/components/fieldops/marketing-auth-actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function RichText({ text }: { text: string }) {
  const chunks = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {chunks.map((chunk, index) => {
        if (chunk.startsWith("**") && chunk.endsWith("**")) {
          return <strong key={index}>{chunk.slice(2, -2)}</strong>;
        }
        if (chunk.startsWith("*") && chunk.endsWith("*")) {
          return <em key={index}>{chunk.slice(1, -1)}</em>;
        }
        return chunk;
      })}
    </>
  );
}

function ComparisonTable({ block }: { block: Extract<CompareBlock, { type: "table" }> }) {
  return (
    <div className="mt-5">
      <div className="space-y-4 md:hidden">
        {block.headers.map((header, column) => (
          <article key={header} className="rounded-lg border border-border bg-card px-4 py-4">
            <h3 className="text-sm font-semibold"><RichText text={header} /></h3>
            <dl className="mt-3 space-y-2 text-sm">
              {block.rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground"><RichText text={row.label} /></dt>
                  <dd className="text-right font-medium"><RichText text={row.cells[column] ?? ""} /></dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-3 pr-4 font-medium text-muted-foreground">Feature</th>
              {block.headers.map((header) => (
                <th key={header} className="px-3 py-3 font-semibold"><RichText text={header} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.label} className="border-b border-border/70">
                <th className="py-3 pr-4 text-left font-medium text-muted-foreground"><RichText text={row.label} /></th>
                {row.cells.map((cell, index) => (
                  <td key={`${row.label}-${index}`} className="px-3 py-3"><RichText text={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.footnote ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <RichText text={block.footnote} />
        </p>
      ) : null}
    </div>
  );
}

const relatedLinks = [
  { id: "jobber", label: "FieldKeel vs Jobber" },
  { id: "housecall-pro", label: "FieldKeel vs Housecall Pro" },
  { id: "servicetitan", label: "FieldKeel vs ServiceTitan" },
];

export function CompareArticleContent({
  article,
  trialDays,
}: {
  article: CompareArticle;
  trialDays: number;
}) {
  return (
    <article className="mx-auto max-w-4xl">
      <p className="type-label">Compare</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{article.heading}</h1>
      <div className="mt-5 space-y-4 text-muted-foreground">
        {article.introduction.map((paragraph, index) => (
          <p key={index}><RichText text={paragraph} /></p>
        ))}
      </div>
      {article.sections.map((section) => {
        if (section.kind === "faq") {
          return (
            <section key={section.heading} className="mt-14">
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              <dl className="mt-6 space-y-5">
                {section.items.map((item) => (
                  <div key={item.question}>
                    <dt className="text-sm font-semibold">{item.question}</dt>
                    <dd className="mt-1.5 text-sm text-muted-foreground">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        }
        if (section.kind === "cta") {
          return (
            <section key={section.heading} className="mt-14 rounded-lg border border-border bg-card px-5 py-6">
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{section.copy}</p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <MarketingHeroAuthCta trialLabel={`Start ${trialDays}-day free trial`} />
                <Button asChild variant="outline" className="h-11 px-4">
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>
            </section>
          );
        }
        return (
          <section key={section.heading} className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
            <div className="mt-4 space-y-4">
              {section.blocks.map((block, index) => {
                if (block.type === "table") return <ComparisonTable key={index} block={block} />;
                if (block.type === "list") {
                  return (
                    <ul key={index} className="list-disc space-y-2 pl-5 text-muted-foreground">
                      {block.items.map((item) => <li key={item}><RichText text={item} /></li>)}
                    </ul>
                  );
                }
                return <p key={index} className="text-muted-foreground"><RichText text={block.text} /></p>;
              })}
            </div>
          </section>
        );
      })}
      <nav className="mt-14 border-t border-border pt-6" aria-label="Related comparisons and product pages">
        <h2 className="text-base font-semibold">Related pages</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary">
          {relatedLinks.filter((link) => link.id !== article.id).map((link) => (
            <li key={link.id}><Link href={`/compare/${link.id}`} className="hover:underline">{link.label}</Link></li>
          ))}
          <li><Link href="/features" className="hover:underline">Features</Link></li>
          <li><Link href="/pricing" className="hover:underline">Pricing</Link></li>
        </ul>
      </nav>
    </article>
  );
}
