import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { catalogPlan, getPublicCatalog } from "@/lib/pricing";
import { getPublicTrust } from "@/lib/trust";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "FieldKeel Billing and Subscription Policy",
  description: "Understand FieldKeel organization invoices, due dates, secure payment links, subscription activation, renewals, and the billing process for workspaces.",
  path: "/billing-policy",
});

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
          FieldKeel issues organization invoices with a FieldKeel invoice
          number, plan, amount, currency, billing period, issued date, and due
          date. When an invoice is ready, Owners (and Admins where permitted)
          see it in Settings → Billing. Eligible Starter and Professional
          invoices can be paid by card through Paddle or by manual invoice/bank
          transfer using the listed instructions.
        </p>
        <p>
          A card purchase creates a Paddle subscription for the selected term
          (1–5 years) that renews at the end of that term unless canceled. The
          next billing date is shown in Billing when available. Manual invoice
          subscriptions do not auto-renew and require a new invoice and payment
          verification for each period. The Professional trial requires no card
          and never auto-charges when it ends.
        </p>
      </LegalSection>
      <LegalSection title="Payment verification and activation">
        <p>
          Payments are verified before a subscription is activated or renewed.
          For manual invoice payments, select “I’ve Sent Payment” after paying.
          The notice does not mark the invoice paid or change access. Allow up
          to 2 business days for platform review. FieldKeel updates the
          subscription and notifies the Owner and Admin billing contacts only
          after payment is verified.
        </p>
        <p>
          FieldKeel subscriptions are business services. Please complete
          payment using an eligible business/commercial payment method available
          on the secure payment page.
        </p>
      </LegalSection>
      <LegalSection title="Renewal">
        <p>
          Paddle card subscriptions renew at the end of the selected term
          (1–5 years) unless canceled. A manual invoice subscription does not
          auto-renew; a new invoice must be issued and payment verified.
          Confirmed renewal updates the next paid period without shortening time
          already paid. If payment remains outstanding after the applicable
          renewal grace period, the workspace may become read-only.
        </p>
      </LegalSection>
      <LegalSection title="Anti-fraud">
        <p>
          Use only the payment link shown in your authenticated FieldKeel
          Billing area or provided through an official FieldKeel communication.
          FieldKeel will never ask for your password, authentication code, full
          card number, or CVV through support messages.
        </p>
      </LegalSection>
      <LegalSection title="Published plans">
        <p>
          FieldKeel publishes Starter, Professional, and Business plans.
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
          Each verified FieldKeel account is eligible for one{" "}
          {catalog?.trialDays ?? 14}-day Professional trial with no credit card.
          The trial begins when the first trial workspace is successfully
          created after email verification. A {catalog?.trialGraceDays ?? 3}-day
          trial grace follows.           Additional workspaces can be created immediately after your free trial has been used; they remain read-only until activated through Billing. Trial eligibility does not reset when a
          workspace is deleted. Paid subscriptions receive a 7-day
          renewal grace after the paid period ends. After the applicable grace,
          the workspace becomes read-only.
        </p>
      </LegalSection>
      <LegalSection title="Expiration and data retention">
        <p>
          Data is not automatically deleted solely because a trial or paid
          period expires. Authorized historical records remain viewable. Billing,
          invoices, documentation, and account areas needed to restore service
          remain available. Writes resume after FieldKeel confirms payment and
          completes activation or renewal.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
