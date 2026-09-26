"use client";

import { BrandMark } from "@/components/fieldops/brand-mark";
import { ApiError, SessionExpiredError } from "@/lib/api";
import { getMyOrganizations } from "@/lib/auth";
import {
  rememberPreferredOrgSlug,
  workspaceHomePath,
} from "@/lib/workspace-home";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * `/app/[orgSlug]` → role-aware home (My Day for technicians, Overview otherwise).
 */
export default function OrgAppIndexPage() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const orgSlug = params.orgSlug;

    getMyOrganizations()
      .then((memberships) => {
        if (cancelled) return;
        const match = memberships.find(
          (item) => item.organization.slug === orgSlug,
        );
        if (!match) {
          if (memberships.length === 0) {
            router.replace("/create-workspace");
            return;
          }
          const fallback = memberships[0];
          rememberPreferredOrgSlug(fallback.organization.slug);
          router.replace(
            workspaceHomePath(fallback.organization.slug, fallback.role),
          );
          return;
        }
        rememberPreferredOrgSlug(match.organization.slug);
        router.replace(workspaceHomePath(match.organization.slug, match.role));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (
          err instanceof SessionExpiredError ||
          (err instanceof ApiError && err.status === 401)
        ) {
          router.replace("/login");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not open this workspace.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [params.orgSlug, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
      <BrandMark />
      <p className="text-sm text-muted-foreground" role="status">
        {error ?? "Opening workspace…"}
      </p>
    </div>
  );
}
