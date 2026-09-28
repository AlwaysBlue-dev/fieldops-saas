import type { MetadataRoute } from "next";
import { FIELDKEEL_ICONS } from "@/lib/pwa";

/**
 * Default FieldKeel web app manifest (marketing site visitors still use `/`).
 * Installed PWA opens `/app` for authenticated workspace bootstrap.
 * Authenticated workspaces may also link
 * `/app/[orgSlug]/manifest.webmanifest` for install naming; start_url remains `/app`.
 *
 * Multiple per-workspace installations are best-effort only — browsers on the
 * same origin often keep a single installed app. See product docs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FieldKeel",
    short_name: "FieldKeel",
    description: "The backbone of your field operations.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f6f9",
    theme_color: "#1c2233",
    categories: ["business", "productivity"],
    icons: FIELDKEEL_ICONS,
  };
}
