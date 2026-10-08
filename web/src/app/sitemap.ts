import type { MetadataRoute } from "next";
import { allArticles } from "@/content/docs/catalog";
import { allComparisons } from "@/content/compare/catalog";
import { SITE_URL } from "@/lib/seo";

const corePages: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
  { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.9 },
  { url: `${SITE_URL}/features`, changeFrequency: "monthly", priority: 0.8 },
  { url: `${SITE_URL}/docs`, changeFrequency: "weekly", priority: 0.8 },
  { url: `${SITE_URL}/trust`, changeFrequency: "monthly", priority: 0.7 },
  { url: `${SITE_URL}/security`, changeFrequency: "monthly", priority: 0.7 },
  { url: `${SITE_URL}/support`, changeFrequency: "monthly", priority: 0.6 },
];

const legalPages = [
  "privacy",
  "terms",
  "billing-policy",
  "acceptable-use",
].map((path) => ({
  url: `${SITE_URL}/${path}`,
  changeFrequency: "yearly" as const,
  priority: 0.3,
}));

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...corePages,
    { url: `${SITE_URL}/compare`, changeFrequency: "monthly", priority: 0.8 },
    ...allComparisons.map((comparison) => ({
      url: `${SITE_URL}/compare/${comparison.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...allArticles.map((article) => ({
      url: `${SITE_URL}/docs/${article.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...legalPages,
  ];
}
