import type { DocArticle } from "../types";

export const storageLimitReached: DocArticle = {
  slug: "storage-limit-reached",
  title: "When storage limit is reached",
  description:
    "What happens when the organization quota is full, how to free space, and when to request a plan change.",
  categoryId: "files-storage",
  keywords: [
    "quota full",
    "storage limit",
    "upgrade",
    "delete files",
    "usage",
  ],
  relatedSlugs: [
    "storage-overview",
    "cannot-upload",
    "billing-plans",
    "workspace-readonly",
  ],
  sections: [
    {
      id: "symptoms",
      heading: "What you will see",
      paragraphs: [
        "When confirmed storage plus the incoming upload would exceed maxStorageBytes for the plan, uploads fail. Create/edit of job evidence and logo changes that need bytes will not succeed until usage drops or the plan limit increases.",
        "Settings → Storage shows included bytes versus used bytes so owners can see how close the workspace is to the ceiling before a field crew hits an error on site.",
      ],
    },
    {
      id: "remedy",
      heading: "Free space or raise the limit",
      paragraphs: [
        "Remove deletable pre-submit files where policy allows. Do not expect to delete locked post-approval evidence casually — that history is intentional. Reducing unused drafts and oversized documents before submit helps keep the quota healthy.",
        "If the company legitimately needs more room, request a plan change (for example Starter → Professional, or Professional → Business) through Plan & Subscription. FieldKeel activates plan changes manually; there is no in-app card checkout.",
      ],
    },
    {
      id: "not-quota",
      heading: "When it is not the quota",
      paragraphs: [
        "Upload failures also happen when the workspace is read-only after trial expiry, when a single file exceeds ~10 MB / 8 MB / 2 MB guidance, when MIME validation fails, or when the user lacks job access. Check those causes before ordering more storage.",
      ],
    },
  ],
};
