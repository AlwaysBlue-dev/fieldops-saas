import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const trust = await getPublicTrust();

  return (
    <LegalDocument title="Security" version={trust.terms} trust={trust}>
      <LegalSection title="Current practices">
        <p>
          FieldOps Cloud is built as a multi-tenant operations product. The
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
      <LegalSection title="What we do not claim">
        <p>
          This page does not list SOC 2, ISO, HIPAA, or other certifications.
          Backup and hosting-region statements will be added when a production
          strategy is actually configured.
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
          Related: <Link href="/trust">Trust Center</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
