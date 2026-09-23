"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { ErrorState } from "@/components/fieldops/error-state";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { getMe, login } from "@/lib/auth";
import {
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@/lib/organizations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"join" | "login">("join");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      previewInvitation(token),
      getMe()
        .then(() => true)
        .catch(() => false),
    ])
      .then(([nextPreview, authed]) => {
        if (cancelled) return;
        setPreview(nextPreview);
        setSignedIn(authed);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Invitation is not available.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function joinAsNew(formData: FormData) {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      const result = await acceptInvitation(token, {
        fullName: String(formData.get("fullName") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      router.replace(`/app/${result.organization.slug}/overview`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept the invitation.");
    } finally {
      setPending(false);
    }
  }

  async function joinExisting(formData: FormData) {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      if (!signedIn) {
        await login(preview.email, String(formData.get("password") ?? ""));
      }
      const result = await acceptInvitation(token);
      router.replace(`/app/${result.organization.slug}/overview`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept the invitation.");
    } finally {
      setPending(false);
    }
  }

  if (status === "loading") {
    return (
      <AuthShell title="Invitation" description="Checking this invite.">
        <SkeletonBlock rows={4} />
      </AuthShell>
    );
  }

  if (status === "error" || !preview) {
    return (
      <AuthShell title="Invitation unavailable" description="This link cannot be used.">
        <ErrorState title={error ?? "Invitation not found"} />
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary">
          Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${preview.organizationName}`}
      description={`This invitation is for ${preview.email} as ${preview.role.replaceAll("_", " ").toLowerCase()}.`}
    >
      {signedIn || mode === "login" ? (
        <ResponsiveForm action={joinExisting}>
          {!signedIn ? (
            <FormField>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11"
              />
            </FormField>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are signed in. Accept to add this organization to your workspace.
            </p>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Joining…" : "Accept invitation"}
          </Button>
          {!signedIn ? (
            <button
              type="button"
              className="text-sm font-medium text-primary"
              onClick={() => setMode("join")}
            >
              Create a new account instead
            </button>
          ) : null}
        </ResponsiveForm>
      ) : (
        <ResponsiveForm action={joinAsNew}>
          <FormField>
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" required className="h-11" />
          </FormField>
          <FormField>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="h-11"
            />
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account and join"}
          </Button>
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => setMode("login")}
          >
            I already have an account
          </button>
        </ResponsiveForm>
      )}
    </AuthShell>
  );
}
