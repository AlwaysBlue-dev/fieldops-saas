import { ApprovalsWorkspace } from "@/components/fieldops/approvals-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return <ApprovalsWorkspace />;
}
