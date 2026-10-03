import type { Metadata } from "next";

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
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
