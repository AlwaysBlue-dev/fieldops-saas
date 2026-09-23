"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { signup } from "@/lib/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await signup({
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        organizationName: String(formData.get("organizationName") ?? ""),
      });
      if (result.organization?.slug) {
        router.replace(`/onboarding?org=${result.organization.slug}`);
        return;
      }
      router.replace("/onboarding");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create the workspace right now.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      description="We’ll open an organization from your company name. You can refine it on the next screen."
      footer={
        <p className="text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary">
            Sign in
          </Link>
        </p>
      }
    >
      <ResponsiveForm action={onSubmit}>
        <FormField>
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            required
            maxLength={120}
            className="h-11"
          />
        </FormField>
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
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        </FormField>
        <FormField>
          <Label htmlFor="organizationName">Company name</Label>
          <Input
            id="organizationName"
            name="organizationName"
            autoComplete="organization"
            required
            maxLength={120}
            className="h-11"
          />
        </FormField>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Creating workspace…" : "Create workspace"}
        </Button>
      </ResponsiveForm>
    </AuthShell>
  );
}
