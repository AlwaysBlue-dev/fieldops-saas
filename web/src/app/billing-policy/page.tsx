import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { catalogPlan, getPublicCatalog } from "@/lib/pricing";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing & Subscription Policy" };

export default async function BillingPolicyPage() {
  const [trust, catalog] = await Promise.all([getPublicTrust(), getPublicCatalog()]);
  const professional = catalogPlan(catalog, "professional");

  return (
    <LegalDocument
      title="Billing & Subscription Policy"
      version={trust.billingPolicy}
      trust={trust}
    >
      <LegalSection title="Manual invoice process">
        <p>
          FieldOps Cloud does not collect card details in the application.
          Customers request activation or renewal, FieldOps prepares an invoice,
          the customer follows payment instructions, and a platform administrator
          marks the invoice paid and then activates or renews the subscription.
        </p>
        <p>
          FieldOps Cloud will never ask you to provide your password, full card
          number, CVV, or authentication credentials by email, support message,
          or chat.
        </p>
        <p>
          Manual payment details are provided only through the authenticated
          FieldOps billing page or an invoice sent from the official FieldOps
          email domain. If you receive payment instructions from an unexpected
          address, verify them through FieldOps Support before sending payment.
        </p>
      </LegalSection>
      <LegalSection title="Professional plan">
        <p>
          The published Professional plan is billed annually
          {professional ? ` at ${professional.priceLabel}` : ""}. Launch limits
          {professional
            ? ` include up to ${professional.includedUsers} users and ${professional.includedStorage} of storage`
            : " are defined on the Plan record"}
          . Those values come from plan configuration and may change for future
          periods with reasonable advance communication. This is not a lifetime
          price promise.
        </p>
      </LegalSection>
      <LegalSection title="Trial and grace">
        <p>
          New eligible organizations receive a {catalog?.trialDays ?? 14}-day
          trial with no credit card. A {catalog?.trialGraceDays ?? 3}-day trial
          grace follows. Paid annual subscriptions receive a 7-day renewal grace
          after the paid period ends. After the applicable grace, the workspace
          becomes read-only.
        </p>
      </LegalSection>
      <LegalSection title="Expiration and data">
        <p>
          Data is not automatically deleted solely because payment expires.
          Authorized historical records remain viewable. Writes resume after
          FieldOps confirms payment and completes activation or renewal.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
