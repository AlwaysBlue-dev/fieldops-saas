import { ModulePlaceholder } from "@/components/fieldops/module-placeholder";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <ModulePlaceholder
      title="Approvals"
      description="Review queue for time, overtime, and completed work."
      emptyTitle="Inbox is clear"
      emptyDescription="Items needing a manager decision will appear in this queue."
      actionLabel="Approve"
    />
  );
}
