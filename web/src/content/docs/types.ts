/**
 * FieldOps Cloud in-app product documentation content model.
 * Articles are TypeScript modules — no CMS or extra npm packages.
 */

export type DocSection = {
  id: string;
  heading: string;
  paragraphs: string[];
};

export type DocArticle = {
  slug: string;
  title: string;
  description: string;
  categoryId: string;
  keywords: string[];
  sections: DocSection[];
  relatedSlugs?: string[];
};

export type DocCategory = {
  id: string;
  title: string;
  description: string;
  order: number;
  /** Default article opened when the category is selected in the nav. */
  primarySlug: string;
};
