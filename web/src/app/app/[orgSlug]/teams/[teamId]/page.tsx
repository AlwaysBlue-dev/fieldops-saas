import { TeamDetailWorkspace } from "@/components/fieldops/team-detail-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };

export default function TeamDetailPage() {
  return <TeamDetailWorkspace />;
}
