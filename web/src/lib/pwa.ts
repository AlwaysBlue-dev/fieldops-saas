/** Client-safe PWA helpers. No auth tokens or business data. */

export const PWA_DOCS_HREF = "/docs/install-fieldops-on-phone";

export const FIELD_OPS_ICONS = [
  {
    src: "/icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any" as const,
  },
  {
    src: "/icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any" as const,
  },
  {
    src: "/icons/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable" as const,
  },
];

/** Truncate for Android short_name (keep readable; avoid mid-word when possible). */
export function truncateShortName(name: string, max = 12): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= 6) return `${slice.slice(0, lastSpace)}…`;
  return `${slice}…`;
}

export function workspaceAppName(orgName: string): string {
  const name = orgName.trim() || "Workspace";
  return `${name} — FieldOps Cloud`;
}

export function workspaceShortName(orgName: string): string {
  return truncateShortName(orgName.trim() || "FieldOps");
}

export function workspaceStartUrl(orgSlug: string): string {
  return `/app/${orgSlug}`;
}

/** Stable manifest id scoped to the workspace route (best-effort separate installs). */
export function workspaceManifestId(orgSlug: string): string {
  return `/app/${orgSlug}`;
}

export type BeforeInstallPromptOutcome = "accepted" | "dismissed";

export type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: BeforeInstallPromptOutcome }>;
};

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const displayStandalone = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const fullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  return displayStandalone || iosStandalone || fullscreen;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS;
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafari =
    /Safari/i.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(ua);
  return isSafari;
}

export function prefersIosInstallInstructions(): boolean {
  return isIosDevice() && !isStandaloneDisplay();
}
