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
      heading: "allowManualTime note",
      paragraphs: [
        "OrganizationSettings.allowManualTime gates manual timesheet entry on the API (default off). The flag exists in schema/onboarding paths, but it is not currently editable in the Settings UI. Do not expect a Settings toggle until that control ships; changing it requires an operator/data path outside the ordinary settings form.",
      ],
    },
    {
      id: "branding-storage-plan",
      heading: "Branding, storage, and plan",
      paragraphs: [
        "Settings → Storage shows org-wide quota usage. Branding/logo upload requires CUSTOM_BRANDING on the effective plan (Professional trial and paid Professional/Business). Logo files should stay near the ~2 MB guidance.",
        "Plan & Subscription shows effective status, trial/renewal dates, usage, and request actions for activation, renewal, or plan change. Request Activation becomes Request Sent after submission and follows invoice progress (prepare → pay → verify → active).",
        "Theme appearance preferences are UI chrome and do not change tenant data.",
      ],
    },
    {
      id: "app-device",
      heading: "App & device",
      paragraphs: [
        "Settings → App & device shows Install FieldKeel for the current workspace, installation status, and a link to the phone install guide. Use More → Install Workspace on mobile for the same flow. This installs a Progressive Web App — not a native store app — and requires a network connection for current workspace data.",
      ],
    },
  ],
};
