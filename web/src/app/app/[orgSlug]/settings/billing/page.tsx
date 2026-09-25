import { PageHeader } from "@/components/fieldops/page-header";
import type { Metadata } from "next";
import { BillingWorkspace } from "./billing-workspace";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  params,
}: PageProps<"/app/[orgSlug]/settings/billing">) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Billing"
        description="Current plan, invoices, and secure payment. FieldKeel does not collect or store card details in the app."
      />
      <BillingWorkspace orgSlug={orgSlug} />
    </div>
  );
}
