import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";

export const metadata = publicPageMetadata({
  title: "FieldKeel field service management features",
  description:
    "Explore FieldKeel scheduling, jobs, AI Workforce, offline field work, missing access warnings, time tracking, approvals, and workspace tools.",
  path: "/features",
});

const features = [
  {
    title: "Schedule",
    copy: "A shared operational calendar for planned visits and crew assignments. Scheduled work shows what is on the board — not a separate confirmation of each technician’s real-time availability.",
  },
  {
    title: "Jobs",
    copy: "Job records, sites, and status from draft through completion.",
  },
  {
    title: "AI Workforce",
    copy: "Ask natural-language questions about authorized jobs, schedules, and missing site access. Get operational summaries and recommendations based on retrieved data. Access is organization-scoped and role-aware. The current assistant is read-only — it does not assign technicians, reschedule work, change statuses, or send customer messages. Included on Professional and Business plans.",
    href: "/docs/ai-workforce-overview",
  },
  {
    title: "Work Offline, Sync When Connected",
    copy: "Technicians can prepare assigned jobs for offline use, record supported field updates without coverage, and sync queued changes when connectivity returns. Dispatch, approvals, and other server-authoritative actions still need a connection.",
    href: "/docs/offline-field-operations",
  },
  {
    title: "Know Before You Dispatch",
    copy: "FieldKeel flags active jobs that are missing site access notes or usable contact information, so teams can fix access gaps before a visit. This is a warning—not a hard dispatch block.",
    href: "/docs/sites-access-notes",
  },
  {
    title: "Clients",
    copy: "Accounts and sites without a separate CRM stack.",
  },
  {
    title: "Teams",
    copy: "Crews, membership, and who you can assign on the schedule board. Scheduling and assignment tools are separate from confirming whether someone is free or on shift at a given moment.",
  },
  {
    title: "Time",
    copy: "Clock sessions, overtime, and a clean timesheet trail.",
  },
  {
    title: "Approvals",
    copy: "A single inbox for work that needs a manager decision.",
  },
  {
    title: "Reports",
    copy: "Operational trends without a separate analytics product.",
  },
  {
    title: "Settings",
    copy: "Organization, roles, and workspace configuration.",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <p className="type-label">Product</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Built around the work, not the admin menu.
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        FieldKeel is an operations system: schedule, jobs, people, time,
        review, and AI Workforce assistance on Professional and Business.
        Each module is designed for both the office and the van.
      </p>
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {features.map((feature) => (
          <article
            key={feature.title}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <h2 className="text-sm font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{feature.copy}</p>
            {"href" in feature && feature.href ? (
              <p className="mt-3 text-sm">
                <Link
                  href={feature.href}
                  className="font-medium text-primary hover:underline"
                >
                  Read the guide
                </Link>
              </p>
            ) : null}
          </article>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        See{" "}
        <Link href="/pricing" className="font-medium text-primary hover:underline">
          pricing
        </Link>{" "}
        for plan capacity, or browse the{" "}
        <Link href="/docs" className="font-medium text-primary hover:underline">
          help center
        </Link>
        .
      </p>
    </MarketingShell>
  );
}
