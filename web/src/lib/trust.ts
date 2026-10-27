import { FIELDKEEL_SUPPORT_EMAIL } from "@/lib/brand";

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
  refundPolicy?: LegalVersion;
};

const FALLBACK: PublicTrust = {
  productName: "FieldKeel",
  supportEmail: FIELDKEEL_SUPPORT_EMAIL,
  salesEmail: FIELDKEEL_SUPPORT_EMAIL,
  securityEmail: FIELDKEEL_SUPPORT_EMAIL,
  legalEntityName: null,
  governingLaw: "the laws of Pakistan",
  hostingRegionConfigured: false,
  terms: { version: "1.0", effectiveDate: "2026-09-28" },
  privacy: { version: "1.0", effectiveDate: "2026-09-28" },
  billingPolicy: { version: "1.0", effectiveDate: "2026-09-28" },
  refundPolicy: { version: "1.0", effectiveDate: "2026-09-28" },
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
