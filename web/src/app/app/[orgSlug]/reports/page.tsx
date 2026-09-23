import { ReportsWorkspace } from "@/components/fieldops/reports-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsWorkspace />;
}
