import type { DocArticle } from "../types";

export const understandingSubscription: DocArticle = {
  slug: "understanding-subscription",
  title: "Understanding your subscription",
  description:
    "How FieldKeel plans, trials, and paid periods work for your organization.",
  categoryId: "billing",
  keywords: ["subscription", "plan", "trial", "renewal", "status"],
  relatedSlugs: [
    "billing-plans",
    "understanding-invoice",
    "trial-expiry-grace",
    "renewing-subscription",
  ],
  sections: [
    {
      id: "overview",
      heading: "Your organization subscription",
      paragraphs: [
        "Each FieldKeel workspace has its own subscription: plan, seat and storage limits, trial or paid period, and billing history. Subscriptions are never pooled across organizations owned by the same account.",
        "Owners (organization OWNER role only) manage billing from Settings → Billing. Admins and other roles do not see invoice or payment details.",
      ],
    },
    {
      id: "statuses",
      heading: "Common statuses",
      paragraphs: [
        "During the Professional trial your workspace is fully writable. After the trial, a short grace window keeps writes available while you complete activation. After grace, the workspace becomes read-only until payment is confirmed.",
        "Paid annual subscriptions remain active through the current billing period, then enter a renewal grace window before becoming read-only if payment remains outstanding.",
      ],
    },
  ],
};

export const understandingInvoice: DocArticle = {
  slug: "understanding-invoice",
  title: "Understanding your invoice",
  description:
    "FieldKeel invoice numbers, amounts, billing periods, and customer-facing statuses.",
  categoryId: "billing",
  keywords: ["invoice", "FC-", "amount", "due date", "status"],
  relatedSlugs: [
    "paying-an-invoice",
    "payment-verification",
    "billing-history",
    "billing-plans",
  ],
  sections: [
    {
      id: "identity",
      heading: "FieldKeel invoice identity",
      paragraphs: [
        "FieldKeel generates its own invoice numbers (for example FC-2026-000021). The invoice records your organization, plan, amount, currency, issued and due dates, billing period, and status.",
        "While an invoice is being prepared you will see “Invoice being prepared.” When it is ready to pay, the status becomes “Payment due.” Manual payments show “Payment under review” after you select I’ve Sent Payment; allow up to 2 business days for verification. Card payments are confirmed from Paddle events.",
      ],
    },
    {
      id: "preparing",
      heading: "Invoice being prepared",
      paragraphs: [
        "Before a secure payment link is ready, Billing still shows the upcoming plan and renewal or activation timing. You will not see a Pay Invoice button until the invoice is issued with a secure payment link.",
      ],
    },
  ],
};

export const payingAnInvoice: DocArticle = {
  slug: "paying-an-invoice",
  title: "Paying an invoice",
  description:
    "Pay by card through Paddle or use manual invoice instructions and verify payment.",
  categoryId: "billing",
  keywords: ["pay", "payment", "secure link", "Pay Invoice"],
  relatedSlugs: [
    "payment-verification",
    "understanding-invoice",
    "activating-subscription",
    "billing-history",
  ],
  sections: [
    {
      id: "how",
      heading: "How to pay",
      paragraphs: [
        "For an issued Starter or Professional invoice, choose Pay by Card to open Paddle checkout for an annual subscription that automatically renews, or follow the manual invoice/bank-transfer instructions. The no-card trial does not automatically convert to a paid subscription.",
        "FieldKeel subscriptions are business services. Please use an eligible business/commercial payment method.",
        "Opening Pay Invoice does not mark the invoice paid and does not activate or renew your subscription by itself.",
      ],
    },
    {
      id: "trust",
      heading: "Stay safe",
      paragraphs: [
        "Use only the payment link shown in your authenticated FieldKeel Billing area or provided through an official FieldKeel communication.",
        "FieldKeel will never ask for your password, authentication code, full card number, or CVV through support messages.",
      ],
    },
  ],
};

export const paymentVerification: DocArticle = {
  slug: "payment-verification",
  title: "Payment verification",
  description:
    "What happens after you pay, including I’ve Sent Payment and confirmation.",
  categoryId: "billing",
  keywords: ["verification", "awaiting", "I've Sent Payment", "confirmed", "payment due"],
  relatedSlugs: [
    "paying-an-invoice",
    "activating-subscription",
    "renewing-subscription",
  ],
  sections: [
    {
      id: "flow",
      heading: "Payments are verified before activation",
      paragraphs: [
        "Paddle card payments are confirmed by a verified Paddle event. Manual invoice payments remain under review until confirmed by a platform admin; allow up to 2 business days.",
        "You may optionally select I’ve Sent Payment to notify FieldKeel. That action does not immediately activate or renew the subscription and does not mark the invoice Paid.",
        "Once payment is confirmed, FieldKeel updates the subscription and the Owner receives confirmation.",
      ],
    },
    {
      id: "not-found",
      heading: "If payment cannot be confirmed",
      paragraphs: [
        "If payment cannot be confirmed, the invoice may return to Payment Due. Billing again shows Pay Invoice and I’ve Sent Payment so you can review the payment details and try again.",
        "You may see a short notice that payment could not be confirmed. FieldKeel does not activate or renew the subscription until payment is verified.",
      ],
    },
  ],
};

export const activatingSubscription: DocArticle = {
  slug: "activating-subscription",
  title: "Activating your subscription",
  description:
    "How a trial workspace becomes an active paid FieldKeel subscription.",
  categoryId: "billing",
  keywords: ["activation", "trial", "paid", "active", "request activation"],
  relatedSlugs: [
    "payment-verification",
    "trial-expiry-grace",
    "understanding-subscription",
    "billing-plans",
  ],
  sections: [
    {
      id: "request",
      heading: "Paying for activation",
      paragraphs: [
        "1. Open Billing from the trial banner or Settings.",
        "2. Review the issued invoice and choose Pay by Card or manual invoice/bank transfer.",
        "3. Card checkout creates an annual subscription that renews through Paddle. Manual invoice payment requires a new invoice each period.",
        "4. After a manual payment, select I’ve Sent Payment and allow up to 2 business days for platform verification.",
        "5. Your subscription becomes active only after Paddle confirms card payment or an authorized platform admin verifies manual payment.",
      ],
    },
    {
      id: "activate",
      heading: "From trial to paid",
      paragraphs: [
        "Near the end of your Professional trial, open Billing to review payment options. The platform billing team must issue an invoice before payment can be made. Pay by card or follow the manual invoice instructions, then wait for payment confirmation.",
        "When payment is confirmed, your subscription becomes active for the billing period shown on the invoice. You will receive a confirmation email.",
      ],
    },
  ],
};

export const renewingSubscription: DocArticle = {
  slug: "renewing-subscription",
  title: "Renewing your subscription",
  description:
    "Renewal reminders, renewal invoices, and what happens after confirmation.",
  categoryId: "billing",
  keywords: ["renew", "renewal", "reminder", "grace"],
  relatedSlugs: [
    "paying-an-invoice",
    "payment-verification",
    "trial-expiry-grace",
    "billing-history",
  ],
  sections: [
    {
      id: "reminders",
      heading: "Before renewal",
      paragraphs: [
        "Paddle card subscriptions renew automatically each year using Paddle's configured recurring price. Manual invoice subscriptions do not auto-renew; a new invoice must be issued and verified. Billing shows the next date when available.",
      ],
    },
    {
      id: "after",
      heading: "After payment confirmation",
      paragraphs: [
        "When payment is confirmed, the subscription renews for the next billing period without shortening time you have already paid for. If payment remains outstanding after the applicable grace period, the workspace may become read-only. Your data remains retained, and Billing stays available so you can restore service.",
      ],
    },
  ],
};

export const trialExpiryGrace: DocArticle = {
  slug: "trial-expiry-grace",
  title: "Trial expiry and grace",
  description:
    "14-day Professional trial, 3-day grace, and read-only behavior.",
  categoryId: "billing",
  keywords: ["trial", "grace", "read-only", "expiry"],
  relatedSlugs: [
    "activating-subscription",
    "workspace-readonly",
    "understanding-subscription",
  ],
  sections: [
    {
      id: "policy",
      heading: "Trial and grace",
      paragraphs: [
        "Each verified FieldKeel account receives one 14-day Professional trial with no credit card required. A 3-day grace follows. After grace, the workspace becomes read-only. Organization data is not deleted because the trial ended.",
        "Paid renewals use a separate 7-day renewal grace. In all cases you can still open Billing, invoices, documentation, and account areas needed to restore service.",
      ],
    },
  ],
};

export const billingHistoryDoc: DocArticle = {
  slug: "billing-history",
  title: "Billing history",
  description: "How to review previous FieldKeel invoices for your organization.",
  categoryId: "billing",
  keywords: ["history", "invoices", "past", "PDF"],
  relatedSlugs: ["understanding-invoice", "paying-an-invoice", "billing-plans"],
  sections: [
    {
      id: "list",
      heading: "Your invoice list",
      paragraphs: [
        "Settings → Billing shows billing history for your organization only: invoice number, type, plan, amount, issued date, due date, and status. Open an invoice for details, Pay Invoice when available, or download the PDF.",
        "You cannot see invoices belonging to another organization.",
      ],
    },
  ],
};
