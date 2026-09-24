import type { DocArticle } from "../types";

export const cannotInvite: DocArticle = {
  slug: "cannot-invite",
  title: "Cannot invite a member",
  description:
    "Troubleshoot invite failures caused by seat limits, role permissions, read-only subscription, or duplicate invitations.",
  categoryId: "troubleshooting",
  keywords: [
    "invite failed",
    "seats",
    "members",
    "quota",
    "permission",
  ],
  relatedSlugs: [
    "members-invitations",
    "billing-plans",
    "workspace-readonly",
    "roles",
  ],
  sections: [
    {
      id: "checks",
      heading: "Checklist",
      paragraphs: [
        "Confirm you are OWNER or ADMIN (or otherwise authorized to invite) in the active organization — not merely a technician in another workspace you also belong to. Switch organization if you invited from the wrong tenant context.",
        "Check Plan & Subscription usage for remaining seats. Starter includes 5 users; Professional 10; Business 100. Soft-deactivated memberships may still count depending on how usage is metered — free a seat or request a plan change if you are at the cap.",
      ],
    },
    {
      id: "readonly",
      heading: "Read-only and duplicates",
      paragraphs: [
        "After trial grace, expired, suspended, or cancelled workspaces reject invites. Request activation first. Also check for an existing pending invitation to the same email you can resend or revoke before creating another.",
        "If the person already has an ACTIVE membership, invite is unnecessary — adjust their role from Members instead.",
      ],
    },
  ],
};
