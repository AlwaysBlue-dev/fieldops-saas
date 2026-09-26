import { AppBootstrap } from "@/components/fieldops/app-bootstrap";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App",
  robots: { index: false, follow: false },
};

/**
 * Installed PWA / app entry. Public marketing homepage stays at `/`.
 * Session, org preference, and role home are resolved client-side.
 */
export default function AppEntryPage() {
  return <AppBootstrap />;
}
