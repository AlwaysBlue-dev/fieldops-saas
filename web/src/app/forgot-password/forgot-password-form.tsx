"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <AuthShell
      title="Reset password"
      description="Password reset is not connected to the API yet. Leave your work email and we’ll use it once the reset flow is live."
      footer={
        <Link href="/login" className="font-medium text-primary">
          Back to sign in
        </Link>
      }
    >
      {submitted ? (
        <p className="text-sm text-muted-foreground">
          Request noted. Reset email is not sending until that endpoint ships.
        </p>
      ) : (
        <ResponsiveForm
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
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
          <Button type="submit" className="h-11 w-full">
            Continue
          </Button>
        </ResponsiveForm>
      )}
    </AuthShell>
  );
}
