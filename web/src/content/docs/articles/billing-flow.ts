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
        "Owners (and admins, where permitted) manage billing from Settings → Billing. Technicians and supervisors do not see invoice or payment details.",
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
        "While an invoice is being prepared you will see “Invoice being prepared.” When it is ready to pay, the status becomes “Payment due.” After you report payment it shows “Payment awaiting verification,” then “Paid” once confirmed.",
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
    "How to open the secure payment link from Billing and complete payment.",
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
        "When your invoice is ready, a secure payment link will appear in your Billing area. Select Pay Invoice and complete payment using the options available on the secure payment page.",
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
        "After you complete payment on the secure payment page, your invoice may remain in “Payment awaiting verification” until payment has been confirmed.",
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
      heading: "Requesting activation",
      paragraphs: [
        "1. Select Request Activation from the trial banner or Settings → Plan & Subscription (Owners and Admins).",
        "2. FieldKeel records the request. The control changes to Request Sent and stays that way until the next billing step — you cannot submit a duplicate request for the same activation cycle.",
        "3. FieldKeel prepares your invoice. The control may show Invoice Being Prepared.",
        "4. When the invoice is issued, open Billing and use Pay Invoice (or View Invoice).",
        "5. Complete payment on the secure payment page. Optionally select I’ve Sent Payment.",
        "6. While FieldKeel verifies payment, Billing shows Payment awaiting verification.",
        "7. After payment is confirmed, your subscription becomes Active for the billing period on the invoice.",
      ],
    },
    {
      id: "activate",
      heading: "From trial to paid",
      paragraphs: [
        "Near the end of your Professional trial, FieldKeel prepares an activation invoice in Billing. Pay using the secure payment link, then wait for payment confirmation.",
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
        "FieldKeel sends reminders before your paid period ends. Your renewal invoice becomes available in Billing. Open Pay Invoice on the secure payment page when it is ready.",
        "FieldKeel does not automatically charge a stored card.",
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
