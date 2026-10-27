import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { publicPageMetadata } from "@/lib/seo";
import { getPublicTrust } from "@/lib/trust";
import Link from "next/link";

export const metadata = publicPageMetadata({
  title: "FieldKeel Refund Policy for Subscription Payments",
  description: "Learn how to request a review of FieldKeel subscription charges, renewals, billing errors, and duplicate payments, and how cancellations affect renewal and access.",
  path: "/refund-policy",
});

export default async function RefundPolicyPage() {
  const trust = await getPublicTrust();

  return (
    <LegalDocument
      title="Refund Policy"
      version={trust.refundPolicy ?? { version: "1.0", effectiveDate: "2026-09-28" }}
      trust={trust}
    >
      <p>
        This policy explains how to ask FieldKeel to review a subscription
        payment. It applies alongside our{" "}
        <Link className="text-primary" href="/billing-policy">
          Billing &amp; Subscription Policy
        </Link>
        ,{" "}
        <Link className="text-primary" href="/terms">
          Terms of Service
        </Link>
        , and{" "}
        <Link className="text-primary" href="/privacy">
          Privacy Policy
        </Link>
        . It does not promise that a payment will be refunded.
      </p>

      <LegalSection title="Subscription purchases">
        <p>
          Starter and Professional subscriptions are prepaid for the term shown
          on the invoice and checkout. Business subscriptions are arranged
          separately. Cancellation and refund requests are separate. Cancelling
          stops future renewal but does not by itself reverse a payment or issue
          a refund. Any refund, withdrawal, or other non-waivable right under
          Paddle's applicable terms or mandatory law remains unaffected. You may
          contact us to request a review of a charge.
        </p>
      </LegalSection>

      <LegalSection title="When you can request a review">
        <p>
          You may ask FieldKeel to review a subscription purchase or renewal,
          including where you believe a charge was duplicated, made in error,
          unauthorized, inconsistent with the checkout or invoice, or connected
          to a service or billing problem. These are grounds to request a
          review, not guarantees of refund eligibility or approval. We assess
          each request under the applicable agreement, payment provider
          process, and legal requirements.
        </p>
      </LegalSection>

      <LegalSection title="Cancellations and future renewals">
        <p>
          For a card subscription, an Owner
          can open Manage billing from the workspace Billing page to manage or
          cancel the Paddle subscription. When Paddle confirms a cancellation
          scheduled for the end of the current paid period, automatic renewal
          is turned off and the workspace remains active through that period.
          The published paid renewal grace and access rules then apply.
          Cancelling renewal and requesting a refund are separate: cancellation
          does not itself reverse a payment or issue a refund. Any refund or
          withdrawal right under Paddle's applicable terms or mandatory law
          remains unaffected.
        </p>
        <p>
          Manual invoice subscriptions do not renew automatically. If you do
          not want another term, do not request or pay a new renewal invoice.
          For help with an invoice or cancellation, contact Support.
        </p>
      </LegalSection>

      <LegalSection title="Renewal or unexpected payment concerns">
        <p>
          If you do not recognize a renewal, believe you canceled before it was
          due, or think a payment was unexpected, contact us promptly with the
          transaction details. We will review the subscription and billing
          records. A cancellation request made after a renewal charge does not
          itself reverse that charge.
        </p>
      </LegalSection>

      <LegalSection title="Billing errors and duplicate charges">
        <p>
          Contact us if an invoice amount, billing term, renewal, or payment
          record appears incorrect, or if you believe you were charged more
          than once. We will review the available invoice and transaction
          records and explain any correction or next step. Do not email full
          card numbers, security codes, passwords, or authentication codes.
        </p>
      </LegalSection>

      <LegalSection title="Payments processed through Paddle">
        <p>
          Paddle processes card checkout transactions and handles refund
          requests under its current{" "}
          <a
            className="text-primary"
            href="https://www.paddle.com/legal/refund-policy"
            target="_blank"
            rel="noreferrer"
          >
            Refund Policy
          </a>{" "}
          and{" "}
          <a
            className="text-primary"
            href="https://www.paddle.com/legal/buyer-terms"
            target="_blank"
            rel="noreferrer"
          >
            Buyer Terms
          </a>
          . Those terms distinguish cancellation from refunds and describe any
          refund review or statutory withdrawal rights that may apply to a
          transaction. Eligibility depends on Paddle's applicable terms and
          circumstances. FieldKeel does not promise automatic refunds or a
          blanket refund entitlement. If you want to request a Paddle refund or
          exercise a withdrawal right, follow the current instructions in
          Paddle's policy; you may also contact FieldKeel for help. FieldKeel
          records confirmed payment adjustments and updates billing status when
          Paddle reports them.
        </p>
      </LegalSection>

      <LegalSection title="How to request a refund review">
        <p>
          Email{" "}
          <a className="text-primary" href="mailto:support@fieldkeel.com">
            support@fieldkeel.com
          </a>{" "}
          with your account email, organization name, invoice or transaction
          reference, and the reason for your request. Include only the payment
          details needed to identify the transaction. Never send full card
          details or other sensitive payment credentials.
        </p>
        <p>
          FieldKeel will review the request and communicate its decision or
          request any information needed to complete the review. Review time
          depends on the issue and, for Paddle payments, on the applicable
          provider process. No fixed response or refund-processing deadline is
          promised by this policy.
        </p>
      </LegalSection>

      <LegalSection title="Legal rights">
        <p>
          Nothing in this policy excludes or restricts consumer rights or other
          legal protections that cannot lawfully be excluded or restricted.
          Where mandatory law provides a right to cancel or receive a refund,
          that right continues to apply.
        </p>
      </LegalSection>

      <p>
        For general billing details, see the{" "}
        <Link className="text-primary" href="/billing-policy">
          Billing &amp; Subscription Policy
        </Link>
        . For help, visit{" "}
        <Link className="text-primary" href="/support">
          Support
        </Link>
        .
      </p>
    </LegalDocument>
  );
}