import { JobsWorkspace } from "@/components/fieldops/jobs-workspace";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <Suspense fallback={<SkeletonBlock rows={8} />}>
      <JobsWorkspace />
    </Suspense>
  );
}
