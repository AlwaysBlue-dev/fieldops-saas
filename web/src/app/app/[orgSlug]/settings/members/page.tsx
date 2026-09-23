import { MembersPanel } from "@/components/fieldops/members-panel";
import { PageHeader } from "@/components/fieldops/page-header";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
}: PageProps<"/app/[orgSlug]/settings/members">) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Members"
        description="Invite people, assign roles, and deactivate accounts. The last owner cannot be removed."
        hideTitleOnMobile
      />
      <p className="mb-4 text-sm">
        <Link href={`/app/${orgSlug}/settings`} className="text-primary">
          Back to settings
        </Link>
      </p>
      <MembersPanel />
    </div>
  );
}
