"use client";

import { useEffect } from "react";

/**
 * Points the document at the workspace manifest so Chromium's install prompt
 * picks up org-scoped name, id, and start_url. Does not touch auth cookies.
 */
export function WorkspaceManifestLink({
  orgSlug,
  orgName,
}: {
  orgSlug: string;
  orgName: string;
}) {
  useEffect(() => {
    const href = `/app/${encodeURIComponent(orgSlug)}/manifest.webmanifest?name=${encodeURIComponent(orgName)}`;

    const links = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.dataset.fieldopsWorkspace = "1";
      link.href = href;
      document.head.appendChild(link);
      return;
    }

    links.forEach((link) => {
      link.href = href;
      link.dataset.fieldopsWorkspace = "1";
    });
  }, [orgSlug, orgName]);

  return null;
}
