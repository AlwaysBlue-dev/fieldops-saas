import { PageHeader } from "@/components/fieldops/page-header";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionSettings } from "./subscription-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
}: PageProps<"/app/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Organization configuration, members, and workspace preferences."
      />
      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Subscription</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Trial, activation, and workspace access. Payments are not available in
          the product yet.
        </p>
        <div className="mt-4">
          <SubscriptionSettings />
        </div>
      </section>
      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">People</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owners and admins invite users, change roles, and deactivate members.
        </p>
        <Button asChild className="mt-4 h-11 md:h-8">
          <Link href={`/app/${orgSlug}/settings/members`}>Manage members</Link>
        </Button>
      </section>
    </div>
  );
}
