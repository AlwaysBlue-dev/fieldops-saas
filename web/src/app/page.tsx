import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Field operations, without the clutter",
};

export default function HomePage() {
  return (
    <MarketingShell>
      <section className="max-w-2xl">
        <p className="type-label">Field service operations</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
          Run the day from one command center.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
          FieldOps Cloud keeps dispatch, crews, time, and approvals in a single
          workspace — dense on desktop, app-like in the field.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="h-11 px-4">
            <Link href="/signup">Start a workspace</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 px-4">
            <Link href="/features">See capabilities</Link>
          </Button>
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Dispatch board",
            copy: "See today’s work, crews in field, and jobs that need a decision.",
          },
          {
            title: "Field-ready mobile",
            copy: "Bottom navigation, large targets, and keyboard-safe forms on a phone.",
          },
          {
            title: "Approvals and time",
            copy: "Clock sessions and review queues stay next to the jobs they belong to.",
          },
        ].map((item) => (
          <article
            key={item.title}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <h2 className="text-sm font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{item.copy}</p>
          </article>
        ))}
      </section>
    </MarketingShell>
  );
}
