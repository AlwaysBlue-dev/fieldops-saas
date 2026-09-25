/**
 * App-facing helpers for FieldKeel product documentation content.
 * Content modules live under `@/content/docs`.
 */

export type { DocArticle, DocCategory, DocSection } from "@/content/docs/types";

export {
  allArticles,
  allCategories,
  getAdjacentArticles,
  getArticle,
  getArticlesByCategory,
  getCategory,
  getPrimaryArticle,
  searchArticles,
} from "@/content/docs/catalog";
