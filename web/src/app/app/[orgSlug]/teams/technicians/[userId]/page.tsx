import { TechnicianProfileWorkspace } from "@/components/fieldops/technician-profile-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Technician" };

export default function TechnicianProfilePage() {
  return <TechnicianProfileWorkspace />;
}
