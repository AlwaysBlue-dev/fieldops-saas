"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { Button } from "@/components/ui/button";
import {
  friendlyErrorMessage,
  friendlySuccessMessage,
} from "@/lib/friendly-message";
import {
  getMe,
  getMyOrganizations,
  logout,
  resendVerification,
  verifyEmail,
  type OrganizationMembership,
  type PublicUser,
} from "@/lib/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const RESEND_COOLDOWN_SECONDS = 60;

async function continueAfterVerified(
  router: ReturnType<typeof useRouter>,
  hasWorkspaceHint?: boolean,
) {
  let memberships: OrganizationMembership[] = [];
  try {
    memberships = await getMyOrganizations();
  } catch {
    memberships = [];
  }
  if (memberships.length > 0 || hasWorkspaceHint) {
    const slug = memberships[0]?.organization.slug;
    if (slug) {
      const org = memberships[0].organization;
      if (!org.onboardingCompletedAt) {
        router.replace(`/onboarding?org=${slug}`);
        return;
      }
      router.replace("/app");
      return;
    }
  }
  router.replace("/create-workspace");
}

export function VerifyEmailClient({ token }: { token: string }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(token.trim()));
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const trimmed = token.trim();

    async function boot() {
      setReady(false);
      setVerifying(Boolean(trimmed));
      setError(null);
      setSuccess(false);
      setMessage(null);

      try {
        let sessionUser: PublicUser | null = null;
        try {
          sessionUser = (await getMe()).user;
        } catch {
          sessionUser = null;
        }
        if (cancelled) return;

        if (sessionUser?.emailVerifiedAt) {
          setUser(sessionUser);
          setSignedOut(false);
          setSuccess(true);
          setMessage("Email verified");
          await continueAfterVerified(routerRef.current);
          return;
        }

        if (trimmed) {
          try {
            const result = await verifyEmail(trimmed);
            if (cancelled) return;
            setUser(result.user);
            setSuccess(true);
            setMessage("Email verified");

            // Prefer live session; fall back to signed-out success if cookies are gone.
            let hasSession = Boolean(sessionUser);
            if (!hasSession) {
              try {
                await getMe();
                hasSession = true;
              } catch {
                hasSession = false;
              }
            }
            if (cancelled) return;

            setSignedOut(!hasSession);
            if (hasSession) {
              await continueAfterVerified(
                routerRef.current,
                result.hasWorkspace,
              );
            }
            return;
          } catch (err: unknown) {
            if (cancelled) return;
            setError(
              friendlyErrorMessage(
                err,
                "This verification link is invalid or has expired. Request a new one below.",
              ),
            );
          }
        }

        if (cancelled) return;
        if (sessionUser) {
          setUser(sessionUser);
          setSignedOut(false);
        } else {
          setSignedOut(true);
        }
      } finally {
        if (!cancelled) {
          setVerifying(false);
          setReady(true);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function onResend() {
    setResendPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await resendVerification();
      setMessage(
        friendlySuccessMessage(
          result.message,
          "We’ve sent a new verification link to your email.",
        ),
      );
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (result.alreadyVerified) {
        setSuccess(true);
        await continueAfterVerified(routerRef.current);
      }
    } catch (err) {
      setError(
        friendlyErrorMessage(
          err,
          "Unable to resend verification email right now.",
        ),
      );
    } finally {
      setResendPending(false);
    }
  }

  async function onSignOut() {
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  if (!ready || verifying) {
    return (
      <AuthShell
        title="Verify your email"
        description="Confirming your work email…"
      >
        <p className="text-sm text-muted-foreground">Please wait a moment.</p>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell
        title="Email verified"
        description={
          signedOut
            ? "Your work email is confirmed. Sign in to open your workspace."
            : "Your work email is confirmed. Opening your workspace…"
        }
      >
        {message ? (
          <p role="status" className="mb-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        {signedOut ? (
          <Button asChild className="h-11 w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        ) : (
          <Button
            className="h-11 w-full"
            onClick={() => void continueAfterVerified(router)}
          >
            Continue
          </Button>
        )}
      </AuthShell>
    );
  }

  if (signedOut) {
    return (
      <AuthShell
        title="Verify your email"
        description="Sign in to resend a verification link."
        footer={
          <Link href="/login" className="font-medium text-primary">
            Sign in
          </Link>
        }
      >
        {error ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button asChild className="h-11 w-full">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href="/signup">Create account</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verify your work email"
      description={
        user
          ? `We sent a verification link to ${user.email}.`
          : "Check your inbox for a verification link."
      }
      footer={
        <button
          type="button"
          onClick={onSignOut}
          className="font-medium text-primary"
        >
          Sign out
        </button>
      }
    >
      <div className="space-y-4">
        {user ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Sent to </span>
            <span className="font-medium">{user.email}</span>
          </p>
        ) : null}
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        {error ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <p className="text-sm text-muted-foreground">
              Request a new link below, or start over with a different email.
            </p>
          </div>
        ) : null}
        <Button
          type="button"
          className="h-11 w-full"
          disabled={resendPending || cooldown > 0}
          onClick={onResend}
        >
          {resendPending
            ? "Sending…"
            : cooldown > 0
              ? `You can resend in ${cooldown} seconds`
              : "Resend verification email"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={async () => {
            await logout().catch(() => undefined);
            router.replace("/signup");
          }}
        >
          Change email / Back to signup
        </Button>
      </div>
    </AuthShell>
  );
}
