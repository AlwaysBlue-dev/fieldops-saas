import type { Metadata } from "next";
import type { PublicCatalog } from "@/lib/pricing";

export const SITE_URL = "https://fieldkeel.com";

type PublicPageMetadata = {
  title: string;
  description: string;
  path: string;
};

export function publicPageMetadata({
  title,
  description,
  path,
}: PublicPageMetadata): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: "FieldKeel",
      title,
      description,
      images: [{ url: "/icons/logo.png", alt: "FieldKeel logo" }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/icons/logo.png"],
    },
  };
}

export function softwareApplicationJsonLd(catalog: PublicCatalog | null) {
  const offers = catalog?.plans.map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    description: plan.priceLabel,
    ...(plan.annualPriceCents !== null
      ? { price: plan.annualPriceCents / 100 }
      : {}),
    ...(plan.currency ? { priceCurrency: plan.currency } : {}),
    url: `${SITE_URL}/pricing`,
  }));

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FieldKeel",
    description:
      "Field service and operations management software for dispatch, crews, time, and approvals. Professional and Business plans include AI Workforce, a read-only assistant for authorized jobs, schedules, and missing site access.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    ...(catalog ? { offers } : {}),
  };
}
