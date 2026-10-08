import type { Metadata } from "next";
import { AppShell } from "@/components/fieldops/app-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppOrgLayout({
  children,
  params,
}: LayoutProps<"/app/[orgSlug]">) {
  const { orgSlug } = await params;
  return <AppShell orgSlug={orgSlug}>{children}</AppShell>;
}
