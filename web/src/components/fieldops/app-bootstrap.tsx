"use client";

import { BrandMark } from "@/components/fieldops/brand-mark";
import { ApiError, SessionExpiredError } from "@/lib/api";
import { getMe, getMyOrganizations } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import {
  readPreferredOrgSlug,
  rememberPreferredOrgSlug,
  resolveActiveMembership,
  workspaceHomePath,
} from "@/lib/workspace-home";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Lightweight PWA / app entry bootstrap.
 * Resolves session (with refresh via apiRequest), active org preference, and role home.
 */
export function AppBootstrap() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const [{ user }, memberships] = await Promise.all([
          getMe(),
          getMyOrganizations(),
        ]);
        if (cancelled) return;

        if (!user.emailVerifiedAt) {
          router.replace("/verify-email");
          return;
        }

        if (memberships.length === 0) {
          router.replace(
            user.platformRole === "SUPER_ADMIN"
              ? "/platform"
              : "/create-workspace",
          );
          return;
        }

        const membership = resolveActiveMembership(
          memberships,
          readPreferredOrgSlug(),
        );
        if (!membership) {
          router.replace("/create-workspace");
          return;
        }

        const canOnboard =
          membership.role === "OWNER" || membership.role === "ADMIN";
        if (canOnboard && !membership.organization.onboardingCompletedAt) {
          router.replace(`/onboarding?org=${membership.organization.slug}`);
          return;
        }

        rememberPreferredOrgSlug(membership.organization.slug);
        router.replace(
          workspaceHomePath(membership.organization.slug, membership.role),
        );
      } catch (err) {
        if (cancelled) return;
        if (
          err instanceof SessionExpiredError ||
          (err instanceof ApiError && err.status === 401)
        ) {
          router.replace("/login");
          return;
        }
        if (err instanceof ApiError && err.error === "NetworkError") {
          setError(
            "We couldn't reach the server. Check your connection and try again.",
          );
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not open your workspace.",
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-foreground">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <BrandMark className="size-10 text-sm" />
        <div>
          <p className="text-base font-semibold tracking-tight">{APP_NAME}</p>
          <p className="mt-1 text-sm text-muted-foreground" role="status">
            {error ? error : "Opening your workspace…"}
          </p>
        </div>
        {error ? (
          <button
            type="button"
            className="h-11 rounded-md border border-border px-4 text-sm font-medium md:h-9"
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
          >
            Try again
          </button>
        ) : (
          <div
            className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
