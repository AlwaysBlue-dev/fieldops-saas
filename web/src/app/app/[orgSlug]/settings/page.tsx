import { PageHeader } from "@/components/fieldops/page-header";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionSettings } from "./subscription-settings";
import { SettingsAppearance } from "./settings-appearance";
import { SettingsAppDevice } from "./settings-app-device";
import { SettingsBrandingSection } from "./settings-branding-section";

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
        <h2 className="text-sm font-semibold">Organization branding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Logo and workspace identity shown in the sidebar and switcher.
        </p>
        <div className="mt-4">
          <SettingsBrandingSection orgSlug={orgSlug} />
        </div>
      </section>
      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Light, dark, or match the system preference.
        </p>
        <div className="mt-4">
          <SettingsAppearance />
        </div>
      </section>
      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">App & device</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Install FieldOps Cloud on your phone for an app-like workspace
          experience.
        </p>
        <div className="mt-4">
          <SettingsAppDevice orgSlug={orgSlug} />
        </div>
      </section>
      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Storage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace storage usage, breakdown, and stored files. Quota is shared
          across the organization.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button asChild className="h-11 md:h-8">
            <Link href={`/app/${orgSlug}/settings/storage`}>Open storage</Link>
          </Button>
          <Link
            href="/docs/storage-overview"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            Learn about storage limits
          </Link>
        </div>
      </section>
      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Plan & Usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Current plan, seats, storage, and feature entitlements. Request a plan
          change when you need more capacity — there is no Pay Now button.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild className="h-11 md:h-8">
            <Link href={`/app/${orgSlug}/settings/plan-usage`}>
              Open plan & usage
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 md:h-8">
            <Link href={`/app/${orgSlug}/settings/billing`}>Open billing</Link>
          </Button>
          <Link
            href="/docs/billing-plans"
            className="inline-flex h-11 items-center text-sm text-primary underline-offset-2 hover:underline md:h-8"
          >
            Billing documentation
          </Link>
        </div>
      </section>
      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Plan & Subscription</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Trial, activation, and renewal. Payment is arranged with FieldOps
          outside the product.
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
