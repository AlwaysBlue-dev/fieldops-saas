import { ModulePlaceholder } from "@/components/fieldops/module-placeholder";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      title="Reports"
      description="Operational trends for the current organization."
      emptyTitle="No report data"
      emptyDescription="Charts stay empty until jobs and time are recorded."
    />
  );
}
