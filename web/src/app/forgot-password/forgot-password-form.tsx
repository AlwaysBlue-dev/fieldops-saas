"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyErrorMessage, friendlySuccessMessage } from "@/lib/friendly-message";
import { forgotPassword } from "@/lib/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await forgotPassword(email);
      setMessage(
        friendlySuccessMessage(
          result.message,
          "If an account exists for this email, we’ve sent password reset instructions.",
        ),
      );
      setSubmitted(true);
    } catch (err) {
      setError(
        friendlyErrorMessage(
          err,
          "Unable to send reset instructions right now.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      description="Enter your work email and we’ll send password reset instructions if an account exists."
      footer={
        <Link href="/login" className="font-medium text-primary">
          Back to sign in
        </Link>
      }
    >
      {submitted ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {message ??
              "If an account exists for this email, we’ve sent password reset instructions."}
          </p>
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Return to sign in
          </Link>
        </div>
      ) : (
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
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </ResponsiveForm>
      )}
    </AuthShell>
  );
}
