import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { getPublicTrust } from "@/lib/trust";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "FieldKeel Privacy Policy: Account and Job Data",
  description:
    "Learn what personal and operational information FieldKeel processes, including account, organization, job, evidence, GPS-on-clock data, and AI Workforce conversations.",
  path: "/privacy",
});

export default async function PrivacyPage() {
  const trust = await getPublicTrust();

  return (
    <LegalDocument title="Privacy Policy" version={trust.privacy} trust={trust}>
      <LegalSection title="Who this covers">
        <p>
          This policy describes how FieldKeel processes personal and
          operational data when you use the application.
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
      <LegalSection title="AI Workforce">
        <p>
          When eligible users use AI Workforce, FieldKeel processes conversation
          content and retrieves organization-scoped operational information the
          signed-in member is already allowed to see — such as authorized job
          lists, schedule information, and missing site-access signals — to
          generate answers. Access remains limited by organization membership,
          role, and existing job visibility rules.
        </p>
        <p>
          AI Workforce may create pending proposals for allow-listed changes
          (such as jobs, clients, sites, or teams). Those proposals do not
          change records until an owner, admin, or operations manager Approves
          them. Users should review AI-generated answers and proposals before
          acting on them.
        </p>
        <p>
          Answering a request may involve configured third-party AI providers
          that process the conversation and the operational results returned for
          that request. FieldKeel may use more than one configured provider and
          can fall back when a provider is unavailable. This policy does not
          invent provider-specific retention periods, training-use policies, or
          certifications; those depend on the providers FieldKeel has
          configured for a deployment and on those providers&apos; own terms.
        </p>
      </LegalSection>
      <LegalSection title="Purposes">
        <p>
          We use this information to provide the service, authenticate users,
          run field workflows, operate AI Workforce where entitled, secure the
          platform, support customers, manage subscriptions and invoices, and
          troubleshoot problems.
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
          Infrastructure vendors such as hosting, object storage, email
          delivery, and configured AI providers may process data on our
          instructions or as needed to generate AI Workforce answers. Production
          application and database hosting for FieldKeel currently runs on cloud
          infrastructure in the United States. We apply access controls, hashed
          passwords, tenant isolation, and audit logging as described on the
          Security page.
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
