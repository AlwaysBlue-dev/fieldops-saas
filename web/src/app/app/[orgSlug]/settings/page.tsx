import { SettingsWorkspace } from "@/components/fieldops/settings-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const tabRaw = query.tab;
  const initialTab = Array.isArray(tabRaw) ? tabRaw[0] : tabRaw;

  return <SettingsWorkspace orgSlug={orgSlug} initialTab={initialTab} />;
}
