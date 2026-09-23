import { AppShell } from "@/components/fieldops/app-shell";

export default async function AppOrgLayout({
  children,
  params,
}: LayoutProps<"/app/[orgSlug]">) {
  const { orgSlug } = await params;
  return <AppShell orgSlug={orgSlug}>{children}</AppShell>;
}
