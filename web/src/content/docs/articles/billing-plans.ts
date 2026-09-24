import type { DocArticle } from "../types";

export const billingPlans: DocArticle = {
  slug: "billing-plans",
  title: "Plans, pricing, and billing",
  description:
    "Starter $299/year (5 users, 5 GB), Professional $499/year (10 users, 20 GB), Business contact sales. One free trial per verified account; secure payment link activation.",
  categoryId: "billing",
  keywords: [
    "pricing",
    "starter",
    "professional",
    "business",
    "invoice",
    "seats",
    "trial",
    "billing",
  ],
  relatedSlugs: [
    "understanding-subscription",
    "understanding-invoice",
    "paying-an-invoice",
    "payment-verification",
    "activating-subscription",
    "renewing-subscription",
    "trial-expiry-grace",
    "billing-history",
    "trial-onboarding",
    "storage-overview",
    "workspace-readonly",
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
        "When your subscription invoice is ready, a secure payment link appears in Settings → Billing. Select Pay Invoice and complete payment on the secure payment page. FieldOps confirms payment before activating or renewing the subscription. There is no automatic card charge in the product today.",
        "Owners and admins request activation from the trial banner or Plan & Subscription. After you select Request Activation, the control becomes Request Sent until an invoice is ready — duplicate open activation requests are not created. See Activating your subscription for the full sequence.",
        "Renewal and plan-change requests from Plan & Subscription also block duplicates while a request is already open or being handled.",
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
