export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  priceLabel: string;
  contactSales: boolean;
  billingInterval: "MONTHLY" | "ANNUAL" | "CUSTOM";
  currency: string;
  maxUsers: number;
  maxStorageBytes: string;
  includedUsers: number;
  includedStorage: string;
  inclusions: string[];
  features: Record<string, unknown>;
};

export type PublicCatalog = {
  trialDays: number;
  trialGraceDays: number;
  trialRequiresCard: boolean;
  supportEmail: string;
  plans: PublicPlan[];
};

export async function getPublicCatalog(): Promise<PublicCatalog | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  try {
    const response = await fetch(`${base}/plans`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as PublicCatalog;
  } catch {
    return null;
  }
}

export function catalogPlan(catalog: PublicCatalog | null, code: string) {
  return catalog?.plans.find((plan) => plan.code === code) ?? null;
}

export function salesPlan(catalog: PublicCatalog | null) {
  return catalog?.plans.find((plan) => plan.contactSales) ?? null;
}
