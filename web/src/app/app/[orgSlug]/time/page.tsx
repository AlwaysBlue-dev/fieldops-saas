import { ModulePlaceholder } from "@/components/fieldops/module-placeholder";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Time" };

export default function TimePage() {
  return (
    <ModulePlaceholder
      title="Time"
      description="Clock sessions and timesheets for the current organization."
      emptyTitle="No time entries"
      emptyDescription="Clock-in activity will collect here. No sample hours are shown."
      actionLabel="Clock In"
    />
  );
}
