import { JobDetailWorkspace } from "@/components/fieldops/job-detail-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Job" };

export default function JobDetailPage() {
  return <JobDetailWorkspace />;
}
