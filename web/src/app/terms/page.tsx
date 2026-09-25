import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const trust = await getPublicTrust();
  const entity = trust.legalEntityName ?? "the FieldKeel operator";
  const law = trust.governingLaw ?? "the laws designated by the FieldKeel operator in the applicable order or invoice";

  return (
    <LegalDocument title="Terms of Service" version={trust.terms} trust={trust}>
      <LegalSection title="1. Acceptance">
        <p>
          By creating a FieldKeel workspace or using the service, you agree
          to these Terms and the Privacy Policy. If you do not agree, do not use
          the service.
        </p>
      </LegalSection>
      <LegalSection title="2. Eligibility and accounts">
        <p>
          You must be able to form a binding contract for your organization. The
          person who creates the workspace is responsible for the organization
          account, authorized users they invite, and keeping credentials secure.
        </p>
      </LegalSection>
      <LegalSection title="3. Authorized users">
        <p>
          Only people your organization invites may access the workspace. You
          are responsible for their activity, role assignments, and promptly
          deactivating access when it is no longer needed.
        </p>
      </LegalSection>
      <LegalSection title="4. Permitted use">
        <p>
          Use FieldKeel only to operate legitimate field-service work for
          your organization. Follow the Acceptable Use Policy. Do not attempt
          unauthorized access, disrupt the service, or misuse storage, GPS, or
          records.
        </p>
      </LegalSection>
      <LegalSection title="5. Trial, subscription, and activation">
        <p>
          Eligible new organizations receive a time-limited trial of the
          published Professional plan. No credit card is collected in the
          application. After the trial and any published grace period, the
          workspace becomes read-only until FieldKeel manually activates an
          annual subscription following confirmed payment of a FieldKeel invoice.
        </p>
        <p>
          Renewals use the same invoice-and-manual-activation process. Payment
          details appear only on an issued invoice in your authenticated billing
          page or an official FieldKeel invoice email.
        </p>
      </LegalSection>
      <LegalSection title="6. Non-payment and expiration">
        <p>
          If a paid period ends and the published renewal grace expires, the
          workspace remains available for authorized viewing but operational
          writes are blocked. Customer data is not deleted solely because a
          subscription expires. Access is restored after renewal is confirmed.
        </p>
      </LegalSection>
      <LegalSection title="7. Customer data">
        <p>
          Your organization owns the customer, job, time, file, and related
          records you submit. FieldKeel processes that data to provide the
          service. After expiry you may continue to view authorized historical
          records and request export or deletion help through support.
        </p>
      </LegalSection>
      <LegalSection title="8. Location data">
        <p>
          GPS evidence is captured only when a user explicitly clocks in or out.
          The current product does not continuously track employees in the
          background. You are responsible for informing your workforce and
          complying with workplace location-privacy rules that apply to you.
        </p>
      </LegalSection>
      <LegalSection title="9. Availability, changes, and support">
        <p>
          We aim to keep the service available and may change features as the
          product develops. Standard support covers product usage, account help,
          defects, and activation or renewal assistance. Custom development is
          not included unless separately agreed.
        </p>
      </LegalSection>
      <LegalSection title="10. Intellectual property">
        <p>
          FieldKeel software, branding, and documentation remain the
          property of {entity}. These Terms do not transfer that ownership.
        </p>
      </LegalSection>
      <LegalSection title="11. Termination">
        <p>
          Either party may stop using or providing the service as described in
          the applicable invoice or written agreement. We may suspend access for
          security, abuse, or non-payment. Surviving clauses include ownership,
          confidentiality of credentials, and limitation language.
        </p>
      </LegalSection>
      <LegalSection title="12. Disclaimers and liability">
        <p>
          The service is provided on a commercially reasonable basis. This
          section is a placeholder for counsel: limitation of liability,
          warranty disclaimer, and indemnity terms should be completed before
          large-scale commercial launch.
        </p>
      </LegalSection>
      <LegalSection title="13. Governing law">
        <p>
          These Terms are governed by {law}, except where a signed order states
          otherwise. Do not treat this as a selected jurisdiction unless that
          value has been configured by the operator.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
