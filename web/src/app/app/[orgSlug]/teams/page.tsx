import { TeamsWorkspace } from "@/components/fieldops/teams-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Teams" };

export default function TeamsPage() {
  return <TeamsWorkspace />;
}
