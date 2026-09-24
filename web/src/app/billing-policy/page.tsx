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
      <LegalSection title="Invoices and due dates">
        <p>
          FieldOps Cloud issues organization invoices with a FieldOps invoice
          number, plan, amount, currency, billing period, issued date, and due
          date. When an invoice is ready, Owners (and Admins where permitted)
          see it in Settings → Billing with a Pay Invoice action that opens a
          secure payment page.
        </p>
        <p>
          FieldOps Cloud does not currently automatically charge a stored card.
          Opening a payment link does not by itself activate or renew a
          subscription.
        </p>
      </LegalSection>
      <LegalSection title="Payment verification and activation">
        <p>
          Payments are verified before a subscription is activated or renewed.
          Customers may optionally report “I’ve Sent Payment”; that notice does
          not mark the invoice paid and does not change subscription access.
          After payment is confirmed, FieldOps updates the subscription and
          notifies the Owner.
        </p>
        <p>
          FieldOps Cloud subscriptions are business services. Please complete
          payment using an eligible business/commercial payment method available
          on the secure payment page.
        </p>
      </LegalSection>
      <LegalSection title="Renewal">
        <p>
          Reminders are sent before a paid period ends. A renewal invoice
          becomes available in Billing. After payment confirmation, the
          subscription renews for the next billing period without shortening
          time already paid. If payment remains outstanding after the applicable
          renewal grace period, the workspace may become read-only.
        </p>
      </LegalSection>
      <LegalSection title="Anti-fraud">
        <p>
          Use only the payment link shown in your authenticated FieldOps Cloud
          Billing area or provided through an official FieldOps communication.
          FieldOps will never ask for your password, authentication code, full
          card number, or CVV through support messages.
        </p>
      </LegalSection>
      <LegalSection title="Published plans">
        <p>
          FieldOps Cloud publishes Starter, Professional, and Business plans.
          Annual list prices and seat/storage limits come from the live Plan
          catalog
          {professional
            ? ` (Professional is currently ${professional.priceLabel} with up to ${professional.includedUsers} users and ${professional.includedStorage})`
            : ""}
          . Values may change for future periods with reasonable advance
          communication. This is not a lifetime price promise. Business is
          contact-sales and is not self-serve checkout.
        </p>
      </LegalSection>
      <LegalSection title="Free Trial">
        <p>
          Each verified FieldOps Cloud account is eligible for one{" "}
          {catalog?.trialDays ?? 14}-day Professional trial with no credit card.
          The trial begins when the first trial workspace is successfully
          created after email verification. A {catalog?.trialGraceDays ?? 3}-day
          trial grace follows. Additional workspaces require their own
          independent subscriptions. Trial eligibility does not reset when a
          workspace is deleted. Paid annual subscriptions receive a 7-day
          renewal grace after the paid period ends. After the applicable grace,
          the workspace becomes read-only.
        </p>
      </LegalSection>
      <LegalSection title="Expiration and data retention">
        <p>
          Data is not automatically deleted solely because a trial or paid
          period expires. Authorized historical records remain viewable. Billing,
          invoices, documentation, and account areas needed to restore service
          remain available. Writes resume after FieldOps confirms payment and
          completes activation or renewal.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
