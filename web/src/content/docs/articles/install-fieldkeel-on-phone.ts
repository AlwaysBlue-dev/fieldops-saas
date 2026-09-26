import type { DocArticle } from "../types";

export const installFieldkeelOnPhone: DocArticle = {
  slug: "install-fieldkeel-on-phone",
  title: "Install FieldKeel App",
  description:
    "Install FieldKeel from a supported browser on mobile or desktop for an app-like experience.",
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
    "desktop",
    "standalone",
    "My Day",
    "Install FieldKeel App",
  ],
  relatedSlugs: [
    "navigation-theme",
    "workspace-concept",
    "security-privacy",
    "my-day",
  ],
  sections: [
    {
      id: "overview",
      heading: "Install FieldKeel App",
      paragraphs: [
        "FieldKeel can be installed from a supported browser on your phone, tablet, or desktop. This is an installable web app — not a separate App Store or Play Store download. It uses the same FieldKeel site, the same secure cookie session, and the same workspaces you already use in the browser.",
        "When FieldKeel is installed, opening the app takes you directly to your workspace if you are signed in. If your session has expired, FieldKeel opens the sign-in screen.",
        "Technicians open directly into My Day where possible. Owners, admins, operations managers, and supervisors open the normal workspace home (Overview).",
      ],
    },
    {
      id: "android",
      heading: "Android / Chrome",
      paragraphs: [
        "1. Open FieldKeel in Chrome (or another Chromium browser that supports install).",
        "2. Sign in with your FieldKeel account (optional on the public site; required for workspace data).",
        "3. Select Install FieldKeel App — from the public site, from More on mobile, from the account menu, or from Settings → App & device.",
        "4. Confirm installation when the browser shows its install prompt.",
        "FieldKeel does not show automatic install popups. Installation always starts from your action.",
      ],
    },
    {
      id: "iphone",
      heading: "iPhone / Safari",
      paragraphs: [
        "iPhone Safari does not always provide the same programmatic install button as Android Chrome. Use Add to Home Screen:",
        "1. Open FieldKeel in Safari (not an in-app browser).",
        "2. Tap Share.",
        "3. Choose Add to Home Screen.",
        "4. Tap Add.",
        "If you already opened FieldKeel from the home screen (standalone mode), the Install FieldKeel App action is hidden — you do not need to add it again.",
      ],
    },
    {
      id: "desktop",
      heading: "Desktop browsers",
      paragraphs: [
        "On supported desktop browsers, use Install FieldKeel App from the account menu, Settings → App & device, or the public homepage section. Confirm the browser install prompt when it appears.",
      ],
    },
    {
      id: "account-orgs",
      heading: "Same account, multiple organizations",
      paragraphs: [
        "The installed app uses the same FieldKeel account and secure cookies as the browser. Opening the app uses the application entry (not the public marketing homepage). After sign-in it restores your last workspace when that membership is still valid, or another available organization from your account.",
        "You can still switch organizations inside the installed app. Signing out returns you to the sign-in screen.",
        "Browsers on the same website origin often support only one installed FieldKeel app.",
      ],
    },
    {
      id: "offline-icons",
      heading: "Internet connection and icons",
      paragraphs: [
        "An internet connection is required for current business data. FieldKeel does not provide full offline job, customer, or timesheet functionality in this release.",
        "The installed icon uses the FieldKeel app icon. Organization logos continue to appear inside the product UI when configured.",
      ],
    },
  ],
};
