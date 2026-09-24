import {
  FIELD_OPS_ICONS,
  workspaceAppName,
  workspaceManifestId,
  workspaceShortName,
  workspaceStartUrl,
} from "@/lib/pwa";
import { NextResponse } from "next/server";

function sanitizeOrgSlug(raw: string): string {
  return decodeURIComponent(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

function sanitizeOrgName(raw: string | null): string | null {
  if (!raw) return null;
  const decoded = raw.trim().slice(0, 80);
  if (!decoded) return null;
  // Strip control characters; keep letters/numbers/punctuation used in business names.
  return decoded.replace(/[\u0000-\u001f\u007f]/g, "");
}

function labelFromSlug(orgSlug: string): string {
  return orgSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Workspace-aware install manifest.
 *
 * Optional `?name=` carries the display organization name from the authenticated
 * shell (not used for authorization). Icons stay FieldOps Cloud defaults —
 * private org logos / presigned URLs are not safe install icons.
 *
 * Manifest `id` is org-scoped for best-effort separate installs; same-origin
 * browsers often still keep a single installed app.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug: rawSlug } = await context.params;
  const orgSlug = sanitizeOrgSlug(rawSlug);

  if (!orgSlug) {
    return NextResponse.json(
      { error: "Invalid organization" },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const nameSource =
    sanitizeOrgName(searchParams.get("name")) ||
    labelFromSlug(orgSlug) ||
    "Workspace";

  const startUrl = workspaceStartUrl(orgSlug);

  const body = {
    id: workspaceManifestId(orgSlug),
    name: workspaceAppName(nameSource),
    short_name: workspaceShortName(nameSource),
    description: `${nameSource} workspace on FieldOps Cloud.`,
    start_url: startUrl,
    scope: "/app/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f6f9",
    theme_color: "#1c2233",
    categories: ["business", "productivity"],
    icons: FIELD_OPS_ICONS,
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
