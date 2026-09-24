export type PublicPlanFeatureFlags = {
  JOBS: boolean;
  TIMESHEETS: boolean;
  GPS: boolean;
  CLIENT_SIGNATURE: boolean;
  ADVANCED_REPORTS: boolean;
  CUSTOM_BRANDING: boolean;
  ADVANCED_BRANDING: boolean;
  APPROVALS: boolean;
};

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  priceLabel: string;
  contactSales: boolean;
  billingInterval: "MONTHLY" | "ANNUAL" | "CUSTOM";
  currency: string;
  annualPriceCents: number | null;
  monthlyPriceCents: number | null;
  maxUsers: number;
  maxStorageBytes: string;
  includedUsers: number;
  includedStorage: string;
  positioning: string | null;
  badge: string | null;
  highlights: string[];
  inclusions: string[];
  featureFlags: PublicPlanFeatureFlags;
};

export type PublicCatalog = {
  trialDays: number;
  trialGraceDays: number;
  trialRequiresCard: boolean;
  trialPlanCode: string;
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

export function annualPriceParts(plan: PublicPlan | null) {
  if (!plan || plan.contactSales) {
    return { amount: "Contact Sales", period: null as string | null };
  }
  const [amount, period] = plan.priceLabel.split("/");
  return { amount: amount || plan.priceLabel, period: period ?? "year" };
}
