import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/platform/"],
    },

    sitemap: "https://fieldkeel.com/sitemap.xml",
    host: "https://fieldkeel.com",
  };
}