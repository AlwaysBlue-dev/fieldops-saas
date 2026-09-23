import { LegalDocument, LegalSection } from "@/components/fieldops/legal-document";
import { getPublicTrust } from "@/lib/trust";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

export default async function AcceptableUsePage() {
  const trust = await getPublicTrust();

  return (
    <LegalDocument title="Acceptable Use Policy" version={trust.terms} trust={trust}>
      <LegalSection title="Do not">
        <ul className="list-disc space-y-1 pl-5">
          <li>Use the service for unlawful activity</li>
          <li>Share accounts in a way that evades seat or role controls</li>
          <li>Probe, scan, or attack the service without written authorization</li>
          <li>Upload malware or harmful content</li>
          <li>Use storage for unrelated bulk archives</li>
          <li>Create fraudulent jobs, timesheets, or evidence</li>
          <li>Infringe other people&apos;s intellectual property</li>
          <li>Interfere with or degrade the service for others</li>
        </ul>
      </LegalSection>
      <LegalSection title="Enforcement">
        <p>
          We may suspend or terminate access for violations, investigate abuse,
          and cooperate with lawful requests. Report concerns to{" "}
          <a className="text-primary" href={`mailto:${trust.securityEmail}`}>
            {trust.securityEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
