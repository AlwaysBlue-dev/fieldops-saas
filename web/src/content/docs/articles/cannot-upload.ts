import type { DocArticle } from "../types";

export const cannotUpload: DocArticle = {
  slug: "cannot-upload",
  title: "Cannot upload a file",
  description:
    "Diagnose upload failures from quota, per-file size, MIME rules, job access, branding entitlement, or read-only subscription.",
  categoryId: "troubleshooting",
  keywords: [
    "upload failed",
    "photo",
    "document",
    "logo",
    "MIME",
    "quota",
  ],
  relatedSlugs: [
    "storage-overview",
    "storage-limit-reached",
    "workspace-readonly",
    "job-execution",
  ],
  sections: [
    {
      id: "size-type",
      heading: "Size and file type",
      paragraphs: [
        "Keep documents near ~10 MB, photos near ~8 MB, and logos near ~2 MB. Oversized files fail before quota math helps you. Use allowed types (for example JPEG/PNG/WebP for photos, PDF/JPEG/PNG for documents). Magic-byte checks reject renamed executables and other disallowed payloads.",
      ],
    },
    {
      id: "quota-access",
      heading: "Quota, access, and branding",
      paragraphs: [
        "If Settings → Storage shows the organization at its plan ceiling, free space or request a higher plan. Uploads also need an authorized job (or branding permission for logos) and a workspace that can mutate — read-only subscriptions block new bytes.",
        "Organization logo specifically needs CUSTOM_BRANDING (Professional+). Starter workspaces without that feature cannot upload a logo even with free storage headroom.",
      ],
    },
  ],
};
