/** Customer-facing product branding. URLs stay environment-driven. */

const DEFAULT_APP_NAME = "FieldKeel";

function resolveAppName(raw: string | undefined): string {
  const value = raw?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (!value) return DEFAULT_APP_NAME;
  // Migrate stale local/staging env values from the previous product name.
  if (/^fieldops(\s+cloud)?$/i.test(value)) return DEFAULT_APP_NAME;
  return value;
}

export const APP_NAME = resolveAppName(process.env.NEXT_PUBLIC_APP_NAME);

/** Homepage hero / document title. Product short name remains APP_NAME elsewhere. */
export const APP_HOME_TITLE = "FieldKeel Cloud";

export const APP_TAGLINE = "The backbone of your field operations.";

export const APP_DESCRIPTION =
  "Professional field service and operations management platform.";

/** Public brand domain for copy only — never use for redirects or API calls. */
export const BRAND_DOMAIN = "fieldkeel.com";

/**
 * Official FieldKeel company contact mailbox (support, sales, security, billing).
 * Safe to show in the browser. Server mail still prefers env overrides.
 */
export const FIELDKEEL_SUPPORT_EMAIL = "support@fieldkeel.com";

export const FIELDKEEL_SUPPORT_MAILTO = `mailto:${FIELDKEEL_SUPPORT_EMAIL}`;

export const FIELDKEEL_EMAIL_FROM = `FieldKeel <${FIELDKEEL_SUPPORT_EMAIL}>`;
