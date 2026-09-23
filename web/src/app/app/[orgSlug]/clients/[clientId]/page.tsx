import { ClientDetailWorkspace } from "@/components/fieldops/client-detail-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Client" };

export default function ClientDetailPage() {
  return <ClientDetailWorkspace />;
}
