"use client";

import { AuthShell } from "@/components/fieldops/auth-shell";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { TimezoneCombobox } from "@/components/fieldops/timezone-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/friendly-message";
import {
  createWorkspace,
  getMe,
  getMyOrganizations,
  logout,
  type OrganizationMembership,
} from "@/lib/auth";
import {
  detectBrowserTimeZone,
  isValidIanaTimeZone,
} from "@/lib/iana-timezones";
import {
  organizationNamesMatch,
  validateOrganizationDisplayName,
} from "@/lib/organization-name";
import { getPublicCatalog, type PublicPlan } from "@/lib/pricing";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

const DRAFT_KEY = "fieldops.draft.create-workspace-name";

type PlanChoice = "starter" | "professional" | "business";

function readDraft() {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(value: string) {
  try {
    if (value.trim()) {
      sessionStorage.setItem(DRAFT_KEY, value);
    } else {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    // Ignore quota / private mode.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}

function planSummary(plan: PublicPlan | null, fallback: string) {
  if (!plan) return fallback;
  const seats = `${plan.includedUsers} users`;
  const storage = plan.includedStorage;
  if (plan.contactSales) {
    return `${plan.name} · Contact sales · ${seats} · ${storage}`;
  }
  return `${plan.name} · ${plan.priceLabel} · ${seats} · ${storage}`;
}

function findOwnedNameMatch(
  memberships: OrganizationMembership[],
  name: string,
) {
  return memberships.find(
    (membership) =>
      membership.role === "OWNER" &&
      organizationNamesMatch(membership.organization.name, name),
  );
}

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState(readDraft);
  const [planCode, setPlanCode] = useState<PlanChoice>("professional");
  const [timezone, setTimezone] = useState("");
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [trialEligible, setTrialEligible] = useState(true);
  const [ownedMemberships, setOwnedMemberships] = useState<
    OrganizationMembership[]
  >([]);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateSlug, setDuplicateSlug] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const detected = detectBrowserTimeZone();
    if (detected) setTimezone(detected);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ user }, memberships, catalog] = await Promise.all([
          getMe(),
          getMyOrganizations(),
          getPublicCatalog(),
        ]);
        if (cancelled) return;
        if (!user.emailVerifiedAt) {
          router.replace("/verify-email");
          return;
        }
        setTrialEligible(user.trialEligible !== false);
        setOwnedMemberships(
          memberships.filter((membership) => membership.role === "OWNER"),
        );
        setPlans(catalog?.plans ?? []);
        setChecking(false);
        router.prefetch("/onboarding");
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const clientDuplicate = useMemo(
    () => findOwnedNameMatch(ownedMemberships, organizationName),
    [ownedMemberships, organizationName],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDuplicateSlug(null);
    setTimezoneError(null);

    const validated = validateOrganizationDisplayName(organizationName);
    if (!validated.ok) {
      setError(validated.message);
      return;
    }

    if (!timezone || !isValidIanaTimeZone(timezone)) {
      setTimezoneError("Please select a valid timezone.");
      return;
    }

    const ownedMatch = findOwnedNameMatch(ownedMemberships, validated.displayName);
    if (ownedMatch) {
      setError(
        `You already have a workspace named “${ownedMatch.organization.name}”.`,
      );
      setDuplicateSlug(ownedMatch.organization.slug);
      return;
    }

    setPending(true);
    writeDraft(validated.displayName);
    setOrganizationName(validated.displayName);
    try {
      const result = await createWorkspace({
        organizationName: validated.displayName,
        timezone,
        ...(trialEligible ? {} : { planCode }),
      });
      clearDraft();
      if (result.trialStarted) {
        router.replace(`/onboarding?org=${result.organization.slug}`);
      } else {
        router.replace(`/app/${result.organization.slug}/settings/billing`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        router.replace("/verify-email");
        return;
      }
      if (
        err instanceof ApiError &&
        err.code === "WORKSPACE_NAME_TAKEN" &&
        err.existingOrganization
      ) {
        setError(err.message);
        setDuplicateSlug(err.existingOrganization.slug);
        return;
      }
      setError(
        friendlyErrorMessage(
          err,
          "Unable to create the workspace right now.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  const starterPlan = plans.find((p) => p.code === "starter") ?? null;
  const professionalPlan =
    plans.find((p) => p.code === "professional") ?? null;
  const businessPlan = plans.find((p) => p.code === "business") ?? null;
  const openSlug = duplicateSlug ?? clientDuplicate?.organization.slug ?? null;
  const openName =
    clientDuplicate?.organization.name ??
    (duplicateSlug
      ? ownedMemberships.find((m) => m.organization.slug === duplicateSlug)
          ?.organization.name
      : null);

  return (
    <AuthShell
      title={
        trialEligible ? "Start your free trial" : "Create another workspace"
      }
      description={
        trialEligible
          ? "Name your company to start the FieldKeel 14-day Professional trial."
          : "Your account has already used its free trial. Additional workspaces require their own subscription."
      }
      footer={
        <button
          type="button"
          className="font-medium text-primary"
          onClick={async () => {
            await logout().catch(() => undefined);
            clearDraft();
            router.replace("/login");
          }}
        >
          Sign out
        </button>
      }
    >
      {checking ? (
        <p className="text-sm text-muted-foreground">Preparing your workspace…</p>
      ) : (
        <>
          {!trialEligible ? (
            <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Each verified FieldKeel account receives one 14-day Professional
              trial. Choose a plan for this workspace, then request activation
              after it is created — payment is arranged with FieldKeel outside
              the product.
            </p>
          ) : null}
          <ResponsiveForm onSubmit={onSubmit}>
            <FormField>
              <Label htmlFor="organizationName">Company name</Label>
              <Input
                id="organizationName"
                name="organizationName"
                autoComplete="organization"
                placeholder="Acme Electrical"
                required
                minLength={2}
                maxLength={120}
                className="h-11"
                value={organizationName}
                onChange={(event) => {
                  const next = event.target.value;
                  setOrganizationName(next);
                  writeDraft(next);
                  setError(null);
                  setDuplicateSlug(null);
                }}
              />
              {clientDuplicate && !error ? (
                <p className="mt-1.5 text-sm text-destructive">
                  You already have a workspace with this name.
                </p>
              ) : null}
            </FormField>
            <FormField>
              <Label htmlFor="timezone">Timezone</Label>
              <TimezoneCombobox
                id="timezone"
                value={timezone}
                onChange={(next) => {
                  setTimezone(next);
                  setTimezoneError(null);
                }}
              />
              {timezoneError ? (
                <p role="alert" className="mt-1.5 text-sm text-destructive">
                  {timezoneError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  We suggest your current timezone when we can detect it. You can
                  change this during onboarding or later in Organization settings.
                </p>
              )}
            </FormField>
            {!trialEligible ? (
              <FormField>
                <Label htmlFor="planCode">Plan</Label>
                <select
                  id="planCode"
                  name="planCode"
                  className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={planCode}
                  onChange={(event) =>
                    setPlanCode(event.target.value as PlanChoice)
                  }
                >
                  <option value="starter">
                    {planSummary(
                      starterPlan,
                      "Starter · $299/year · 5 users · 5 GB",
                    )}
                  </option>
                  <option value="professional">
                    {planSummary(
                      professionalPlan,
                      "Professional · $499/year · 10 users · 20 GB",
                    )}
                  </option>
                  <option value="business">
                    {planSummary(
                      businessPlan,
                      "Business · Contact sales · 100 users · 250 GB",
                    )}
                  </option>
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {planCode === "business"
                    ? "Business is sales-assisted. After creating the workspace, contact sales or request activation from billing."
                    : "After create, open billing to request activation. FieldKeel sends an official invoice — there is no card checkout in the app."}
                </p>
              </FormField>
            ) : null}
            {error ? (
              <div role="alert" className="space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                {openSlug ? (
                  <Button asChild variant="outline" className="h-11 w-full">
                    <Link href={`/app/${openSlug}/overview`}>
                      Open {openName ?? "workspace"}
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : openSlug && clientDuplicate ? (
              <Button asChild variant="outline" className="h-11 w-full">
                <Link href={`/app/${openSlug}/overview`}>
                  Open {clientDuplicate.organization.name}
                </Link>
              </Button>
            ) : null}
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={pending || Boolean(clientDuplicate)}
            >
              {pending
                ? "Creating workspace…"
                : trialEligible
                  ? "Start 14-day Professional trial"
                  : "Create workspace"}
            </Button>
          </ResponsiveForm>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Need to verify a different email?{" "}
            <Link href="/verify-email" className="font-medium text-primary">
              Verification page
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
