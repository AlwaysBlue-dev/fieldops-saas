import { MarketingShell } from "@/components/fieldops/marketing-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
};

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
        FieldOps Cloud is an operations system: schedule, jobs, people, time,
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
          </article>
        ))}
      </div>
    </MarketingShell>
  );
}
