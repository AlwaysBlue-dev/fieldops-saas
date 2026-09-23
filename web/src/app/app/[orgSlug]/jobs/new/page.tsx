import { JobFormWorkspace } from "@/components/fieldops/job-form-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New job" };

export default function NewJobPage() {
  return <JobFormWorkspace />;
}
