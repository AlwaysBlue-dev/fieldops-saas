export type LegalVersion = {
  version: string;
  effectiveDate: string;
};

export type PublicTrust = {
  productName: string;
  supportEmail: string;
  salesEmail: string;
  securityEmail: string;
  legalEntityName: string | null;
  governingLaw: string | null;
  hostingRegionConfigured: boolean;
  terms: LegalVersion;
  privacy: LegalVersion;
  billingPolicy: LegalVersion;
};

const FALLBACK: PublicTrust = {
  productName: "FieldOps Cloud",
  supportEmail: "support@fieldops.local",
  salesEmail: "sales@fieldops.local",
  securityEmail: "security@fieldops.local",
  legalEntityName: null,
  governingLaw: null,
  hostingRegionConfigured: false,
  terms: { version: "2026-09-23", effectiveDate: "2026-09-23" },
  privacy: { version: "2026-09-23", effectiveDate: "2026-09-23" },
  billingPolicy: { version: "2026-09-23", effectiveDate: "2026-09-23" },
};

export async function getPublicTrust(): Promise<PublicTrust> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  try {
    const response = await fetch(`${base}/trust`, { cache: "no-store" });
    if (!response.ok) return FALLBACK;
    return (await response.json()) as PublicTrust;
  } catch {
    return FALLBACK;
  }
}
