"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { PasswordInput } from "@/components/fieldops/password-input";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyErrorMessage } from "@/lib/friendly-message";
import { signup } from "@/lib/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SignupForm({ description }: { description: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signup({
        fullName,
        email,
        password,
        acceptTerms,
      });
      if (result.emailVerificationRequired || !result.user.emailVerifiedAt) {
        router.replace("/verify-email");
        return;
      }
      router.replace("/create-workspace");
    } catch (err) {
      setError(
        friendlyErrorMessage(err, "Unable to create your account right now."),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description={description}
      footer={
        <p className="text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary">
            Sign in
          </Link>
        </p>
      }
    >
      <ResponsiveForm onSubmit={onSubmit}>
        <FormField>
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            placeholder="Alex Rivera"
            required
            maxLength={120}
            className="h-11"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </FormField>
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
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        </FormField>
        <FormField>
          <label className="flex items-start gap-3 text-sm">
            <input
              id="acceptTerms"
              name="acceptTerms"
              type="checkbox"
              required
              className="mt-1 size-4"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="font-medium text-primary" target="_blank">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-medium text-primary" target="_blank">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        </FormField>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </ResponsiveForm>
    </AuthShell>
  );
}
