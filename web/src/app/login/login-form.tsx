"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { PasswordInput } from "@/components/fieldops/password-input";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyErrorMessage } from "@/lib/friendly-message";
import { getMyOrganizations, login } from "@/lib/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setUnverified(false);
    setPending(true);
    try {
      const result = await login(email, password);
      if (result.emailVerificationRequired || !result.user.emailVerifiedAt) {
        setUnverified(true);
        router.replace("/verify-email");
        return;
      }
      const memberships = await getMyOrganizations();
      if (memberships.length === 0) {
        router.replace(
          result.user.platformRole === "SUPER_ADMIN"
            ? "/platform"
            : "/create-workspace",
        );
        return;
      }
      router.replace(`/app/${memberships[0].organization.slug}/overview`);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to sign in right now."));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      description="Enter your work email to open the operations workspace."
      footer={
        <p className="text-muted-foreground">
          New to FieldOps?{" "}
          <Link href="/signup" className="font-medium text-primary">
            Create an account
          </Link>
        </p>
      }
    >
      <ResponsiveForm onSubmit={onSubmit}>
        <FormField>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            className="h-11"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary"
            >
              Forgot password
            </Link>
          </div>
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
        {unverified ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p role="status">Your email address has not been verified.</p>
            <Link href="/verify-email" className="font-medium text-primary">
              Resend verification email
            </Link>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </ResponsiveForm>
    </AuthShell>
  );
}
