import { PageHeader } from "@/components/fieldops/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { StorageWorkspace } from "./storage-workspace";

export const metadata: Metadata = { title: "Storage" };

export default async function StorageSettingsPage({
  params,
}: PageProps<"/app/[orgSlug]/settings/storage">) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Storage"
        description="Organization storage usage, breakdown, and stored files. Quota is shared across the workspace."
      />
      <p className="mb-4 text-sm">
        <Link href={`/app/${orgSlug}/settings`} className="text-primary">
          Back to settings
        </Link>
      </p>
      <p className="mb-4 text-sm text-muted-foreground">
        <Link
          href="/docs/storage-overview"
          className="text-primary underline-offset-2 hover:underline"
        >
          Learn about storage limits
        </Link>
      </p>
      <StorageWorkspace orgSlug={orgSlug} />
    </div>
  );
}
