"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { getMe, getMyOrganizations, login } from "@/lib/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      await login(
        String(formData.get("email") ?? ""),
        String(formData.get("password") ?? ""),
      );
      const memberships = await getMyOrganizations();
      if (memberships.length === 0) {
        const { user } = await getMe();
        router.replace(user.platformRole === "SUPER_ADMIN" ? "/platform" : "/onboarding");
        return;
      }
      router.replace(`/app/${memberships[0].organization.slug}/overview`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to sign in right now.",
      );
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
            Create a workspace
          </Link>
        </p>
      }
    >
      <ResponsiveForm action={onSubmit}>
        <FormField>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-11"
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
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11"
          />
        </FormField>
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
