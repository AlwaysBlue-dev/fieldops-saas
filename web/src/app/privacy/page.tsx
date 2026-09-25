import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const trust = await getPublicTrust();

  return (
    <LegalDocument title="Privacy Policy" version={trust.privacy} trust={trust}>
      <LegalSection title="Who this covers">
        <p>
          This policy describes how FieldKeel processes personal and
          operational data when you use the application. It is a product
          template for legal review.
        </p>
      </LegalSection>
      <LegalSection title="Account information">
        <p>
          We process names, work email addresses, and optional phone numbers to
          create accounts, authenticate users, and send transactional messages.
        </p>
      </LegalSection>
      <LegalSection title="Organization and operational data">
        <p>
          Workspaces store company profile details, team membership, clients and
          sites, jobs, work notes, materials, timesheets, and approvals. Field
          evidence may include photos, files, and signatures attached to jobs.
        </p>
      </LegalSection>
      <LegalSection title="Location">
        <p>
          GPS coordinates may be stored as evidence when a user explicitly
          clocks in or out. FieldKeel does not currently perform continuous
          background employee tracking.
        </p>
      </LegalSection>
      <LegalSection title="Technical and security data">
        <p>
          We process IP address, user agent, and audit or security logs to
          operate authentication, investigate issues, and protect the service.
        </p>
      </LegalSection>
      <LegalSection title="Purposes">
        <p>
          We use this information to provide the service, authenticate users,
          run field workflows, secure the platform, support customers, manage
          subscriptions and invoices, and troubleshoot problems.
        </p>
      </LegalSection>
      <LegalSection title="Retention, access, and deletion">
        <p>
          Records remain available to authorized users of the workspace,
          including after a subscription becomes read-only. Expired workspaces
          are not automatically emptied. Organization owners may request access,
          export help, or deletion through {trust.supportEmail}.
        </p>
      </LegalSection>
      <LegalSection title="Service providers and security">
        <p>
          Infrastructure vendors such as hosting, object storage, and email
          delivery may process data on our instructions. We apply access
          controls, hashed passwords, tenant isolation, and audit logging as
          described on the Security page. We do not claim a specific production
          hosting country until that region is configured.
        </p>
      </LegalSection>
      <LegalSection title="Contact">
        <p>
          Privacy questions:{" "}
          <a className="text-primary" href={`mailto:${trust.supportEmail}`}>
            {trust.supportEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
