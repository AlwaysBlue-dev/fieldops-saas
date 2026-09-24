import type { MetadataRoute } from "next";

/**
 * Default FieldOps Cloud web app manifest (marketing / non-workspace).
 * Authenticated workspaces override the linked manifest via
 * `/app/[orgSlug]/manifest.webmanifest` for install naming and start_url.
 *
 * Multiple per-workspace installations are best-effort only — browsers on the
 * same origin often keep a single installed app. See product docs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FieldOps Cloud",
    short_name: "FieldOps",
    description:
      "Field-service operations for dispatch, jobs, crews, time, and approvals.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f6f9",
    theme_color: "#1c2233",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
