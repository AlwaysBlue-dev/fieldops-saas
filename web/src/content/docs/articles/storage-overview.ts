import type { DocArticle } from "../types";

export const storageOverview: DocArticle = {
  slug: "storage-overview",
  title: "Files and storage",
  description:
    "Storage is an organization-wide quota managed under Settings → Storage. Job files and the organization logo count toward the plan limit.",
  categoryId: "files-storage",
  keywords: [
    "storage",
    "quota",
    "photos",
    "documents",
    "logo",
    "upload",
  ],
  relatedSlugs: [
    "storage-limit-reached",
    "cannot-upload",
    "billing-plans",
    "organization-settings",
  ],
  sections: [
    {
      id: "quota",
      heading: "Organization-wide quota",
      paragraphs: [
        "File bytes are metered per organization, not per user. Job photos, documents, signatures, and the organization logo consume the same plan storage pool. Check usage under Settings → Storage alongside your plan’s included storage (for example 5 GB on Starter, 20 GB on Professional, 250 GB on Business).",
        "Objects live in private S3-compatible storage. PostgreSQL stores metadata only. Downloads use short-lived authorized URLs or streamed content after tenant checks — never public bucket browsing.",
      ],
    },
    {
      id: "limits",
      heading: "Per-file size guidance",
      paragraphs: [
        "Practical per-file caps are approximately 10 MB for documents, 8 MB for photos, and 2 MB for the organization logo. Uploads also require an allowed MIME type and magic-byte validation; extension alone is not trusted. Executables are rejected.",
        "Organization logo upload additionally requires the CUSTOM_BRANDING plan feature (Professional and above, including Professional trial entitlement).",
      ],
    },
    {
      id: "lifecycle",
      heading: "Evidence lifecycle",
      paragraphs: [
        "Before submit, uploaders or editors may delete photos/documents as allowed. After submit or approval, evidence locks. Signatures are not casually removed from the Files UI. Active subscription write access is required for new uploads.",
      ],
    },
  ],
};
