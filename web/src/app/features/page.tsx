import { MarketingShell } from "@/components/fieldops/marketing-shell";
import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";

export const metadata = publicPageMetadata({
  title: "FieldKeel field service management features",
  description:
    "Explore FieldKeel scheduling, jobs, offline field work, missing access warnings, time tracking, approvals, and workspace tools.",
  path: "/features",
});

const features = [
  {
    title: "Schedule",
    copy: "A shared operational calendar for visits, crews, and capacity.",
  },
  {
    title: "Jobs",
    copy: "Job records, sites, and status from draft through completion.",
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
    copy: "Crews, membership, and who is available to dispatch.",
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
        and review. Each module is designed for both the office and the van.
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
