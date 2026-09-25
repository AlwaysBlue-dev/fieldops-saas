import type { DocArticle } from "../types";

export const installFieldkeelOnPhone: DocArticle = {
  slug: "install-fieldkeel-on-phone",
  title: "Install FieldKeel on your phone",
  description:
    "Add your workspace to the home screen as a Progressive Web App for an app-like experience.",
  categoryId: "getting-started",
  keywords: [
    "PWA",
    "install",
    "home screen",
    "Android",
    "iPhone",
    "Safari",
    "Chrome",
    "mobile",
    "standalone",
  ],
  relatedSlugs: ["navigation-theme", "workspace-concept", "security-privacy"],
  sections: [
    {
      id: "overview",
      heading: "Install as an app (not a native store app)",
      paragraphs: [
        "FieldKeel can be installed as a Progressive Web App (PWA) from a supported mobile browser. This is not a separate App Store or Play Store download — it uses the same FieldKeel site, the same secure cookie session, and the same workspaces you already use in the browser.",
        "After installation, your phone shows an app icon. Opening it launches FieldKeel in standalone mode (without the normal browser chrome) and returns you to the workspace you installed from when that path is still available to your account.",
      ],
    },
    {
      id: "android",
      heading: "Android / Chrome",
      paragraphs: [
        "1. Open FieldKeel in Chrome (or another Chromium browser that supports install).",
        "2. Sign in with your FieldKeel account.",
        "3. Open the organization workspace you want (for example ABC Electrical).",
        "4. Select Install Workspace — from More on mobile, from the account menu, or from Settings → App & device.",
        "5. Confirm installation when the browser shows its install prompt.",
        "FieldKeel does not show automatic install popups. Installation always starts from your action.",
      ],
    },
    {
      id: "iphone",
      heading: "iPhone / Safari",
      paragraphs: [
        "iPhone Safari does not always provide the same programmatic install button as Android Chrome. Use Add to Home Screen:",
        "1. Open FieldKeel in Safari (not an in-app browser).",
        "2. Sign in with your FieldKeel account.",
        "3. Open your workspace.",
        "4. Tap Share.",
        "5. Choose Add to Home Screen.",
        "6. Tap Add.",
        "If you already opened FieldKeel from the home screen (standalone mode), the Install Workspace action is hidden or shown as Installed — you do not need to add it again.",
      ],
    },
    {
      id: "account-orgs",
      heading: "Same account, multiple organizations",
      paragraphs: [
        "The installed app uses the same FieldKeel account and secure cookies as the browser. If your session expires, you sign in through the normal login screen, then return to your workspace when membership allows it.",
        "You can still switch organizations inside the installed app. If you no longer belong to the workspace that was used at install time, FieldKeel does not expose that organization — you are redirected to another available workspace or the usual organization selection flow. Backend membership checks remain authoritative.",
        "Browsers on the same website origin often support only one installed FieldKeel app. Workspace-specific names and start URLs are best-effort: the install may identify the current workspace (for example “ABC Electrical — FieldKeel”), but separate home-screen icons per organization are not guaranteed on every device.",
      ],
    },
    {
      id: "offline-icons",
      heading: "Internet connection and icons",
      paragraphs: [
        "An internet connection is required for current business data. FieldKeel does not provide full offline job, customer, or timesheet functionality in this release. If you are offline, you will see a clear offline message and a Try Again action — not stale operational records presented as current.",
        "The installed icon uses the FieldKeel app icon. Organization logos continue to appear inside the product UI when configured. Mobile platforms may cache the home-screen icon, so changing an organization logo later does not reliably update the installed app icon.",
      ],
    },
  ],
};
