import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { getPublicTrust } from "@/lib/trust";
import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "FieldKeel security",
  description:
    "Read about FieldKeel's current application security practices, including organization access controls, private file access, audit logging, and AI Workforce boundaries.",
  path: "/security",
});

export default async function SecurityPage() {
  const trust = await getPublicTrust();

  return (
    <LegalDocument title="Security" version={trust.terms} trust={trust}>
      <LegalSection title="Current practices">
        <p>
          FieldKeel is built as a multi-tenant operations product. The
          following controls are implemented in the current application. We do
          not claim that any system is completely secure.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>HTTPS is expected in production deployments</li>
          <li>HTTP-only session cookies; tokens are not stored in browser storage</li>
          <li>Password hashing</li>
          <li>Role-based organization authorization</li>
          <li>Organization-scoped queries and tenant isolation tests</li>
          <li>Private object storage with authorized file access</li>
          <li>Audit logging of sensitive actions</li>
          <li>Server-side validation and authentication rate limiting</li>
          <li>Least-privilege checks on platform versus tenant APIs</li>
        </ul>
      </LegalSection>
      <LegalSection title="AI Workforce">
        <p>
          AI Workforce runs inside the signed-in user&apos;s organization
          membership. Lookups for jobs, schedules, and missing access use the
          same organization scope and role-based job visibility as the rest of
          FieldKeel. The assistant cannot open another organization&apos;s data.
        </p>
        <p>
          In the current product, AI Workforce is read-only: it retrieves and
          summarizes authorized operational information. It does not assign
          technicians, reschedule jobs, change statuses, send customer messages,
          or dispatch work on its own. Answers should be reviewed by users
          before operational decisions.
        </p>
        <p>
          Generating an answer may involve configured AI service providers that
          process the conversation and the operational results the assistant is
          allowed to retrieve. FieldKeel does not claim third-party AI provider
          certifications or retention guarantees on this page. See the{" "}
          <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/docs/ai-workforce-limits-safety">
            AI Workforce limits and safety
          </Link>
          .
        </p>
      </LegalSection>
      <LegalSection title="What we do not claim">
        <p>
          This page does not list SOC 2, ISO, HIPAA, or other certifications.
          Backup and hosting-region statements will be added when a production
          strategy is actually configured. We also do not invent AI provider
          retention, encryption, or compliance certifications beyond what those
          providers publish separately.
        </p>
      </LegalSection>
      <LegalSection title="Report a security concern">
        <p>
          Email{" "}
          <a className="text-primary" href={`mailto:${trust.securityEmail}`}>
            {trust.securityEmail}
          </a>
          . Include enough detail for us to reproduce the issue. Do not include
          customer passwords or payment credentials.
        </p>
        <p>
          Related: <Link href="/trust">Trust Center</Link>,{" "}
          <Link href="/privacy">Privacy Policy</Link>, and{" "}
          <Link href="/docs/ai-workforce-overview">AI Workforce documentation</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
