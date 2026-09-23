import { PageHeader } from "@/components/fieldops/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanUsageWorkspace } from "./plan-usage-workspace";

export const metadata: Metadata = { title: "Plan & Usage" };

export default async function PlanUsagePage({
  params,
}: PageProps<"/app/[orgSlug]/settings/plan-usage">) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Plan & Usage"
        description="Seats, storage, and features for this workspace. No payment forms in the product."
      />
      <p className="mb-4 text-sm">
        <Link href={`/app/${orgSlug}/settings`} className="text-primary">
          Back to settings
        </Link>
      </p>
      <PlanUsageWorkspace />
    </div>
  );
}
