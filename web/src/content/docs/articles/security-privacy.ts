import type { DocArticle } from "../types";

export const securityPrivacy: DocArticle = {
  slug: "security-privacy",
  title: "Security and privacy",
  description:
    "HTTP-only cookie sessions, membership-based authorization, private object storage, and honest limits — no SOC 2 / ISO / HIPAA claims in this product docs set.",
  categoryId: "security-privacy",
  keywords: [
    "cookies",
    "session",
    "HTTP-only",
    "tenant isolation",
    "privacy",
    "security",
  ],
  relatedSlugs: [
    "workspace-concept",
    "roles",
    "storage-overview",
    "forgot-password",
    "verify-work-email",
  ],
  sections: [
    {
      id: "session",
      heading: "Sessions and cookies",
      paragraphs: [
        "Sign-in establishes HTTP-only cookies for access and refresh (`fieldops_access`, `fieldops_refresh` — legacy technical cookie names). Tokens are not placed in localStorage, sessionStorage, or ordinary SPA JSON storage. Logout revokes refresh tokens. CORS allows the web origin with credentials — not a wildcard open origin.",
        "Organization role and organization id in the UI are selection aids. Authority comes from loading an ACTIVE OrganizationMembership on the server for every tenant request.",
      ],
    },
    {
      id: "tenancy",
      heading: "Tenant isolation",
      paragraphs: [
        "Operational rows persist organizationId. Lookups use id plus organizationId. Cross-tenant ids return 404. In-org forbidden actions return 403. Platform SUPER_ADMIN tools are separate routes and do not silently read tenant job photos or customer files.",
        "Uploads require auth, org scope, size caps, MIME allow-lists, magic-byte checks, and private bucket keys under the organization. Presigned GET URLs are short-lived capability tokens issued only after authorization.",
      ],
    },
    {
      id: "claims",
      heading: "What we do not claim",
      paragraphs: [
        "This documentation does not claim SOC 2, ISO, or HIPAA certification or attestation. Describing cookies, isolation, and private storage is product behavior — not a compliance certificate. If your customer requires a formal report, handle that commercially outside these articles.",
        "Password reset uses a short-lived emailed link. The raw reset secret is never stored in the browser or returned in API JSON — see Forgot your password. New accounts must verify their work email before creating a workspace — see Verify your work email.",
      ],
    },
  ],
};
