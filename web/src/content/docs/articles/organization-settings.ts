import type { DocArticle } from "../types";

export const organizationSettings: DocArticle = {
  slug: "organization-settings",
  title: "Organization settings",
  description:
    "Configure timezone, evidence rules including requireGps, numbering, branding (when entitled), storage visibility, and plan screens.",
  categoryId: "organization-settings",
  keywords: [
    "settings",
    "timezone",
    "requireGps",
    "branding",
    "storage",
    "allowManualTime",
  ],
  relatedSlugs: [
    "time-gps",
    "storage-overview",
    "billing-plans",
    "security-privacy",
    "install-fieldkeel-on-phone",
  ],
  sections: [
    {
      id: "workspace-deletion",
      heading: "Workspace deletion",
      paragraphs: [
        "Owners can delete or request deletion under Settings → Organization → Danger Zone, even when the workspace is read-only. A workspace that has never been commercially activated, including a free-trial-only workspace, can be deleted directly after confirmation.",
        "Previously activated workspaces require FieldKeel review. Submitting a request does not delete the workspace. Owners can see pending, rejected, or cancelled status and cancel a pending request. Approval removes access for all members.",
        "Deletion removes workspace access and cannot be undone in FieldKeel. Billing, audit, workspace records, and stored files are retained; deletion does not physically erase that data. Deleting a workspace does not reset your account's lifetime trial.",
      ],
    },
    {
      id: "ops",
      heading: "Operating basics",
      paragraphs: [
        "Organization settings control IANA timezone (source of business-day calculations), week start and working-hours related structure, overtime thresholds, evidence rules, and job number prefix/sequence. Locale and date-time display preferences help office and field share the same clock language.",
        "Settings → Organization lets Owners and Admins update company name, business type, phone, and timezone. FieldKeel suggests your device timezone during setup; you can search and change the timezone anytime. Choose a listed business type, or select Other and enter a custom type.",
        "requireGps is an organization setting that requires coordinates on clock evidence when validation runs for completion and approval. Turn it on only if crews can grant location permission in the field.",
      ],
    },
    {
      id: "manual-time",
      heading: "Manual time entry",
      paragraphs: [
        "Manual timesheet entry is off by default and is not currently controllable from Settings. Treat clock-based time as the supported path until a Settings toggle ships.",
      ],
    },
    {
      id: "branding-storage-plan",
      heading: "Branding, storage, and plan",
      paragraphs: [
        "Settings → Storage shows org-wide quota usage. Organization logo uploads are available on Professional trial and paid Professional/Business plans. Logo files should stay near the ~2 MB guidance.",
        "Plan & Subscription, Plan & Usage, and Billing are available only to the organization Owner. They show status, trial/renewal dates, usage, invoices, and payment options. Open Billing to pay an issued invoice by card or manual invoice. Manual payment remains under review until FieldKeel confirms receipt.",
        "Theme appearance preferences are UI chrome and do not change tenant data.",
      ],
    },
    {
      id: "app-device",
      heading: "App & device",
      paragraphs: [
        "Settings → App & device shows Install FieldKeel App, installation status, and a link to the install guide. Use More → Install FieldKeel App on mobile for the same flow. This installs FieldKeel as a Progressive Web App — not a native store app — and requires a network connection for current workspace data.",
      ],
    },
  ],
};
