import { TimesheetWorkspace } from "@/components/fieldops/timesheet-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Time" };

export default function TimePage() {
  return <TimesheetWorkspace />;
}
