"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { PasswordInput } from "@/components/fieldops/password-input";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { friendlyErrorMessage } from "@/lib/friendly-message";
import { resetPassword } from "@/lib/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token.trim()) {
    return (
      <AuthShell
        title="Reset link unavailable"
        description="This password reset link is invalid or has expired."
        footer={
          <Link href="/forgot-password" className="font-medium text-primary">
            Request a new reset link
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Open the latest email from FieldOps Cloud, or request a new link from
          the forgot password page.
        </p>
      </AuthShell>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Those passwords don’t match. Please try again.");
      return;
    }
    setPending(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(
        friendlyErrorMessage(err, "Unable to reset password right now."),
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        description="Your password was changed successfully. Sign in with your new password."
        footer={
          <Link href="/login" className="font-medium text-primary">
            Return to sign in
          </Link>
        }
      >
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Enter a new password for your FieldOps Cloud account."
      footer={
        <Link href="/forgot-password" className="font-medium text-primary">
          Request a new reset link
        </Link>
      }
    >
      <ResponsiveForm onSubmit={onSubmit}>
        <FormField>
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            required
            minLength={10}
            maxLength={128}
            className="h-11"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        </FormField>
        <FormField>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            required
            minLength={10}
            maxLength={128}
            className="h-11"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </FormField>
        {error ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            {/invalid or has expired/i.test(error) ? (
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary"
              >
                Request a new reset link
              </Link>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </ResponsiveForm>
    </AuthShell>
  );
}
