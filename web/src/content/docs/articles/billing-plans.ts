import type { DocArticle } from "../types";

export const billingPlans: DocArticle = {
  slug: "billing-plans",
  title: "Plans, pricing, and billing",
  description:
    "Starter $299/year (5 users, 5 GB), Professional $499/year (10 users, 20 GB), Business contact sales (100 users, 250 GB). One free trial per verified account; manual invoice activation.",
  categoryId: "billing",
  keywords: [
    "pricing",
    "starter",
    "professional",
    "business",
    "invoice",
    "seats",
    "trial",
  ],
  relatedSlugs: [
    "trial-onboarding",
    "storage-overview",
    "workspace-readonly",
    "organization-settings",
    "workspace-concept",
  ],
  sections: [
    {
      id: "catalog",
      heading: "Public plans",
      paragraphs: [
        "Published plans: Starter at $299 per year with 5 users and 5 GB storage; Professional at $499 per year with 10 users and 20 GB (Most Popular, trial default); Business is contact sales with up to 100 users and 250 GB. Prices and limits are catalog-driven — the marketing pages read the public plans API rather than inventing numbers in components.",
        "CUSTOM_BRANDING (organization logo) is available on Professional and above. Advanced branding is a Business-oriented flag. Most field functionality is available across plans; seats and storage are the primary commercial limits.",
      ],
    },
    {
      id: "free-trial-eligibility",
      heading: "Free Trial Eligibility",
      paragraphs: [
        "Each verified FieldOps Cloud account receives one 14-day Professional free trial. The trial starts when the first trial workspace is successfully provisioned after email verification. No credit card is required.",
        "Additional organizations you create require their own subscription and do not receive another free trial. Deleting a previous organization does not restore trial eligibility. Organization subscriptions are always independent — seats, storage, billing period, and trial/grace state are never pooled across workspaces owned by the same account.",
        "Joining another organization through an invitation does not consume or change your free-trial eligibility.",
      ],
    },
    {
      id: "how-pay",
      heading: "How payment works",
      paragraphs: [
        "No payment provider is connected in-app. Customers trial the product (once per verified account), request activation, arrange payment with FieldOps, and a platform operator activates or renews the workspace by hand against a manual invoice process.",
        "Owners and admins can also open renewal and plan-change requests from Plan & Subscription. Duplicate open requests of the same type are rejected so sales is not flooded with repeats.",
      ],
    },
    {
      id: "support",
      heading: "Support expectations",
      paragraphs: [
        "Professional includes standard support for usage, account, bugs, product issues, activation/renewal, and updates. Custom development, integrations, bespoke workflows, custom reports, large migrations, and consulting are not included automatically.",
      ],
    },
  ],
};
