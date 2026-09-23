import { ClientsWorkspace } from "@/components/fieldops/clients-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return <ClientsWorkspace />;
}
