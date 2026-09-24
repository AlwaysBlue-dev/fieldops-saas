"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { ErrorState } from "@/components/fieldops/error-state";
import { PasswordInput } from "@/components/fieldops/password-input";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyErrorMessage } from "@/lib/friendly-message";
import { getMe, login } from "@/lib/auth";
import {
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@/lib/organizations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"join" | "login">("join");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");

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
        setError(
          friendlyErrorMessage(err, "This invitation is not available."),
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function joinAsNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      const result = await acceptInvitation(token, {
        fullName,
        password,
      });
      router.replace(`/app/${result.organization.slug}/overview`);
    } catch (err) {
      setError(
        friendlyErrorMessage(err, "Could not accept the invitation. Please try again."),
      );
    } finally {
      setPending(false);
    }
  }

  async function joinExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      if (!signedIn) {
        await login(preview.email, password);
      }
      const result = await acceptInvitation(token);
      router.replace(`/app/${result.organization.slug}/overview`);
    } catch (err) {
      setError(
        friendlyErrorMessage(err, "Could not accept the invitation. Please try again."),
      );    } finally {
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
        <ResponsiveForm onSubmit={joinExisting}>
          {!signedIn ? (
            <FormField>
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                className="h-11"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
        <ResponsiveForm onSubmit={joinAsNew}>
          <FormField>
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              placeholder="Alex Rivera"
              required
              className="h-11"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </FormField>
          <FormField>
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="At least 10 characters"
              required
              minLength={10}
              className="h-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
