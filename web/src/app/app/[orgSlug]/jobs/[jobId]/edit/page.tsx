import { JobEditWorkspace } from "@/components/fieldops/job-edit-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit job" };

export default function EditJobPage() {
  return <JobEditWorkspace />;
}
