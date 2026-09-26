"use client";

import { Button } from "@/components/ui/button";
import { ApiError, SessionExpiredError } from "@/lib/api";
import { getMe, getMyOrganizations } from "@/lib/auth";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type MarketingAuthKind =
  | "loading"
  | "anonymous"
  | "verify_email"
  | "create_workspace"
  | "open_workspace"
  | "platform";

const MarketingAuthContext = createContext<MarketingAuthKind>("loading");

export function MarketingAuthProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<MarketingAuthKind>("loading");

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const { user } = await getMe();
        if (cancelled) return;

        if (!user.emailVerifiedAt) {
          setKind("verify_email");
          return;
        }

        const memberships = await getMyOrganizations();
        if (cancelled) return;

        if (memberships.length > 0) {
          setKind("open_workspace");
          return;
        }

        if (user.platformRole === "SUPER_ADMIN") {
          setKind("platform");
          return;
        }

        setKind("create_workspace");
      } catch (err) {
        if (cancelled) return;
        if (
          err instanceof SessionExpiredError ||
          (err instanceof ApiError && err.status === 401)
        ) {
          setKind("anonymous");
          return;
        }
        setKind("anonymous");
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MarketingAuthContext.Provider value={kind}>
      {children}
    </MarketingAuthContext.Provider>
  );
}

export function useMarketingAuth(): MarketingAuthKind {
  return useContext(MarketingAuthContext);
}

function AuthActionsSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "flex h-9 w-36 items-center gap-2"
          : "flex h-11 w-48 items-center gap-2"
      }
      aria-hidden
    >
      <div className="h-8 flex-1 animate-pulse rounded-md bg-muted" />
      <div className="h-8 flex-1 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

/** Header account actions for marketing pages (desktop + mobile). */
export function MarketingAuthActions({
  className,
}: {
  className?: string;
}) {
  const kind = useMarketingAuth();
  const wrap = useMemo(
    () => `flex items-center gap-2 ${className ?? ""}`.trim(),
    [className],
  );

  if (kind === "loading") {
    return (
      <div className={wrap}>
        <AuthActionsSkeleton compact />
      </div>
    );
  }

  if (kind === "anonymous") {
    return (
      <div className={wrap}>
        <Button variant="ghost" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild>
          <Link href="/signup">Start trial</Link>
        </Button>
      </div>
    );
  }

  if (kind === "verify_email") {
    return (
      <div className={wrap}>
        <Button asChild>
          <Link href="/verify-email">Verify email</Link>
        </Button>
      </div>
    );
  }

  if (kind === "create_workspace") {
    return (
      <div className={wrap}>
        <Button asChild>
          <Link href="/create-workspace">Create workspace</Link>
        </Button>
      </div>
    );
  }

  if (kind === "platform") {
    return (
      <div className={wrap}>
        <Button asChild>
          <Link href="/platform">Open platform</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <Button asChild>
        <Link href="/app">Open workspace</Link>
      </Button>
    </div>
  );
}

/** Hero primary CTA for the public home page. */
export function MarketingHeroAuthCta({
  trialLabel,
}: {
  trialLabel: string;
}) {
  const kind = useMarketingAuth();

  if (kind === "loading") {
    return <AuthActionsSkeleton />;
  }

  if (kind === "anonymous") {
    return (
      <Button asChild className="h-11 px-4">
        <Link href="/signup">{trialLabel}</Link>
      </Button>
    );
  }

  if (kind === "verify_email") {
    return (
      <Button asChild className="h-11 px-4">
        <Link href="/verify-email">Verify email</Link>
      </Button>
    );
  }

  if (kind === "create_workspace") {
    return (
      <Button asChild className="h-11 px-4">
        <Link href="/create-workspace">Create workspace</Link>
      </Button>
    );
  }

  if (kind === "platform") {
    return (
      <Button asChild className="h-11 px-4">
        <Link href="/platform">Open platform</Link>
      </Button>
    );
  }

  return (
    <Button asChild className="h-11 px-4">
      <Link href="/app">Open workspace</Link>
    </Button>
  );
}

export function marketingHeroSupportCopy(kind: MarketingAuthKind): string | null {
  if (kind === "anonymous") return null;
  if (kind === "verify_email") {
    return "Finish verifying your email to continue.";
  }
  if (kind === "create_workspace") {
    return "Create your organization to start working in FieldKeel.";
  }
  if (kind === "open_workspace" || kind === "platform") {
    return "You are signed in.";
  }
  return null;
}
