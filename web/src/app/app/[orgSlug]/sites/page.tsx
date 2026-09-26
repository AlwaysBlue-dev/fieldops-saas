import { SitesWorkspace } from "@/components/fieldops/sites-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sites" };

export default function SitesPage() {
  return <SitesWorkspace />;
}
