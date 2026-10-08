import type { CompareArticle } from "./types";
import { jobberComparison } from "./jobber";
import { housecallproComparison } from "./housecall-pro";
import { servicetitanComparison } from "./servicetitan";

export const allComparisons: CompareArticle[] = [
  jobberComparison,
  housecallproComparison,
  servicetitanComparison,
];

export function getComparison(id: string): CompareArticle | undefined {
  return allComparisons.find((comparison) => comparison.id === id);
}
