import { ScheduleWorkspace } from "@/components/fieldops/schedule-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return <ScheduleWorkspace />;
}
