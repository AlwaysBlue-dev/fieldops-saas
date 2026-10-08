export type CompareBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | {
      type: "table";
      headers: string[];
      rows: { label: string; cells: string[] }[];
      footnote?: string;
    };

export type CompareFaq = { question: string; answer: string };

export type CompareSection =
  | { kind: "content"; heading: string; blocks: CompareBlock[] }
  | { kind: "faq"; heading: string; items: CompareFaq[] }
  | { kind: "cta"; heading: string; copy: string };

export type CompareArticle = {
  id: "jobber" | "housecall-pro" | "servicetitan";
  slug: string;
  title: string;
  metaDescription: string;
  heading: string;
  introduction: string[];
  sections: CompareSection[];
};
