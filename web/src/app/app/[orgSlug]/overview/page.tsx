import { OverviewBoard } from "@/components/fieldops/overview-board";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function OverviewPage({
  params,
}: PageProps<"/app/[orgSlug]/overview">) {
  const { orgSlug } = await params;
  return <OverviewBoard orgSlug={orgSlug} />;
}
