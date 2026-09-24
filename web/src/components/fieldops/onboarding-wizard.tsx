"use client";

import { BrandMark } from "@/components/fieldops/brand-mark";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { StickyMobileActionBar } from "@/components/fieldops/sticky-mobile-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { getMyOrganizations, type OrganizationMembership } from "@/lib/auth";
import {
  advanceOnboarding,
  createClient,
  createInvitation,
  getOrganization,
  type OrganizationDetail,
  type WorkWeekDay,
} from "@/lib/organizations";
import { cn } from "cn";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const INDUSTRIES = [
  "Electrical",
  "HVAC",
  "Plumbing",
  "Fire & Security",
  "Maintenance",
  "Facilities",
  "Other",
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "UTC",
];

const WEEK: { id: WorkWeekDay; label: string }[] = [
  { id: "MON", label: "Mon" },
  { id: "TUE", label: "Tue" },
  { id: "WED", label: "Wed" },
  { id: "THU", label: "Thu" },
  { id: "FRI", label: "Fri" },
  { id: "SAT", label: "Sat" },
  { id: "SUN", label: "Sun" },
];

const STEPS = [
  { id: 1, title: "Company" },
  { id: 2, title: "Operations" },
  { id: 3, title: "Team" },
  { id: 4, title: "Client" },
];

export function OnboardingWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [week, setWeek] = useState<WorkWeekDay[]>(["MON", "TUE", "WED", "THU", "FRI"]);
  const [signature, setSignature] = useState(true);
  const [gps, setGps] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMyOrganizations()
      .then(async (memberships) => {
        if (cancelled) return;
        const hinted = params.get("org");
        const match =
          memberships.find((item) => item.organization.slug === hinted) ??
          memberships[0];
        if (!match) {
          router.replace("/create-workspace");
          return;
        }
        if (
          match.organization.onboardingCompletedAt &&
          match.role !== "OWNER" &&
          match.role !== "ADMIN"
        ) {
          router.replace(`/app/${match.organization.slug}/overview`);
          return;
        }
        const detail = await getOrganization(match.organization.id);
        if (cancelled) return;
        if (detail.onboardingCompletedAt) {
          router.replace(`/app/${detail.slug}/overview`);
          return;
        }
        setMembership(match);
        setOrg(detail);
        setStep(Math.min(detail.onboardingStep || 1, 4));
        if (detail.settings) {
          setWeek(detail.settings.workingWeek);
          setSignature(detail.settings.requireClientSignature);
          setGps(detail.settings.requireGps);
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  if (!membership || !org) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Opening workspace…
      </div>
    );
  }

  async function go(next: number, complete = false) {
    if (!org) return;
    setPending(true);
    setError(null);
    try {
      const updated = await advanceOnboarding(org.id, {
        step: next,
        complete,
      });
      setOrg(updated);
      if (complete) {
        router.replace(`/app/${updated.slug}/overview`);
        return;
      }
      setStep(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this step.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-workspace">
      <div
        className="mx-auto flex min-h-dvh max-w-lg flex-col px-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <header className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold">Set up {org.name}</p>
              <p className="text-xs text-muted-foreground">
                Step {step} of {STEPS.length}
              </p>
            </div>
          </div>
        </header>

        <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Onboarding progress">
          {STEPS.map((item) => (
            <li key={item.id} className="min-w-0">
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  item.id <= step ? "bg-primary" : "bg-border",
                )}
              />
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {item.title}
              </p>
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <ProfileStep
            org={org}
            pending={pending}
            error={error}
            onSubmit={async (form) => {
              setPending(true);
              setError(null);
              try {
                const updated = await advanceOnboarding(org.id, {
                  step: 2,
                  profile: {
                    name: String(form.get("name") ?? org.name),
                    industry: String(form.get("industry") ?? "") || undefined,
                    phone: String(form.get("phone") ?? "") || undefined,
                    timezone: String(form.get("timezone") ?? org.timezone),
                  },
                });
                setOrg(updated);
                setStep(2);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not save company profile.");
              } finally {
                setPending(false);
              }
            }}
          />
        ) : null}

        {step === 2 ? (
          <OperationsStep
            org={org}
            week={week}
            signature={signature}
            gps={gps}
            pending={pending}
            error={error}
            onWeek={setWeek}
            onSignature={setSignature}
            onGps={setGps}
            onBack={() => setStep(1)}
            onSubmit={async (form) => {
              setPending(true);
              setError(null);
              try {
                const updated = await advanceOnboarding(org.id, {
                  step: 3,
                  settings: {
                    jobNumberPrefix: String(form.get("jobNumberPrefix") ?? "JOB-"),
                    workingWeek: week,
                    defaultDailyHoursLimit: Number(form.get("defaultDailyHoursLimit") || 8),
                    requireClientSignature: signature,
                    requireGps: gps,
                  },
                });
                setOrg(updated);
                setStep(3);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not save operations setup.");
              } finally {
                setPending(false);
              }
            }}
          />
        ) : null}

        {step === 3 ? (
          <InviteStep
            pending={pending}
            error={error}
            onBack={() => setStep(2)}
            onSkip={() => void go(4)}
            onSubmit={async (email, role) => {
              setPending(true);
              setError(null);
              try {
                if (email) {
                  await createInvitation(org.id, { email, role });
                }
                await go(4);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not send invitation.");
                setPending(false);
              }
            }}
          />
        ) : null}

        {step === 4 ? (
          <ClientStep
            pending={pending}
            error={error}
            onBack={() => setStep(3)}
            onSkip={() => void go(5, true)}
            onSubmit={async (form) => {
              setPending(true);
              setError(null);
              try {
                const name = String(form.get("clientName") ?? "").trim();
                if (name) {
                  await createClient(org.id, {
                    name,
                    email: String(form.get("clientEmail") ?? "") || undefined,
                    phone: String(form.get("clientPhone") ?? "") || undefined,
                    site: {
                      name: String(form.get("siteName") ?? "") || undefined,
                      addressLine1: String(form.get("addressLine1") ?? "") || undefined,
                      city: String(form.get("city") ?? "") || undefined,
                    },
                  });
                }
                await go(5, true);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not create the client.");
                setPending(false);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProfileStep({
  org,
  pending,
  error,
  onSubmit,
}: {
  org: OrganizationDetail;
  pending: boolean;
  error: string | null;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <ResponsiveForm action={onSubmit} className="flex-1">
      <h1 className="text-xl font-semibold tracking-tight">Company profile</h1>
      <p className="text-sm text-muted-foreground">
        Confirm how this organization appears to your crew. Everything except
        the name can stay blank.
      </p>
      <FormField>
        <Label htmlFor="name">Company name</Label>
        <Input id="name" name="name" defaultValue={org.name} required className="h-11" />
      </FormField>
      <FormField>
        <Label htmlFor="industry">Industry</Label>
        <select
          id="industry"
          name="industry"
          defaultValue={org.industry ?? ""}
          className="h-11 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground dark:bg-input/30"
        >
          <option value="">Select if you want</option>
          {INDUSTRIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </FormField>
      <FormField>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={org.phone ?? ""} className="h-11" />
      </FormField>
      <FormField>
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={org.timezone}
          className="h-11 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground dark:bg-input/30"
        >
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </FormField>
      <StepError error={error} />
      <StickyMobileActionBar>
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </Button>
      </StickyMobileActionBar>
    </ResponsiveForm>
  );
}

function OperationsStep({
  org,
  week,
  signature,
  gps,
  pending,
  error,
  onWeek,
  onSignature,
  onGps,
  onBack,
  onSubmit,
}: {
  org: OrganizationDetail;
  week: WorkWeekDay[];
  signature: boolean;
  gps: boolean;
  pending: boolean;
  error: string | null;
  onWeek: (days: WorkWeekDay[]) => void;
  onSignature: (value: boolean) => void;
  onGps: (value: boolean) => void;
  onBack: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <ResponsiveForm action={onSubmit} className="flex-1">
      <h1 className="text-xl font-semibold tracking-tight">Operations setup</h1>
      <p className="text-sm text-muted-foreground">
        These defaults apply to new jobs and time. You can change them later.
      </p>
      <FormField>
        <Label htmlFor="jobNumberPrefix">Job number prefix</Label>
        <Input
          id="jobNumberPrefix"
          name="jobNumberPrefix"
          defaultValue={org.settings?.jobNumberPrefix ?? "JOB-"}
          className="h-11"
        />
      </FormField>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Working week</legend>
        <div className="flex flex-wrap gap-2">
          {WEEK.map((day) => {
            const active = week.includes(day.id);
            return (
              <button
                key={day.id}
                type="button"
                onClick={() =>
                  onWeek(
                    active
                      ? week.filter((item) => item !== day.id)
                      : [...week, day.id],
                  )
                }
                className={cn(
                  "h-11 min-w-11 rounded-md border px-3 text-sm",
                  active
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <FormField>
        <Label htmlFor="defaultDailyHoursLimit">Normal daily hours</Label>
        <Input
          id="defaultDailyHoursLimit"
          name="defaultDailyHoursLimit"
          type="number"
          min={1}
          max={24}
          step="0.5"
          defaultValue={org.settings?.defaultDailyHoursLimit ?? 8}
          className="h-11"
        />
      </FormField>
      <ToggleRow
        id="signature"
        label="Require client signature"
        checked={signature}
        onCheckedChange={onSignature}
      />
      <ToggleRow
        id="gps"
        label="Require GPS on clock events"
        checked={gps}
        onCheckedChange={onGps}
      />
      <StepError error={error} />
      <StickyMobileActionBar>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" className="h-11" disabled={pending}>
            {pending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </StickyMobileActionBar>
    </ResponsiveForm>
  );
}

function InviteStep({
  pending,
  error,
  onBack,
  onSkip,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onSubmit: (email: string, role: "TECHNICIAN" | "SUPERVISOR" | "ADMIN") => void;
}) {
  return (
    <ResponsiveForm
      className="flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit(
          String(form.get("email") ?? "").trim(),
          String(form.get("role") ?? "TECHNICIAN") as "TECHNICIAN" | "SUPERVISOR" | "ADMIN",
        );
      }}
    >
      <h1 className="text-xl font-semibold tracking-tight">Invite the team</h1>
      <p className="text-sm text-muted-foreground">
        Send one invitation now, or skip and add people from Settings later.
      </p>
      <FormField>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" className="h-11" />
      </FormField>
      <FormField>
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          defaultValue="TECHNICIAN"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="TECHNICIAN">Technician</option>
          <option value="SUPERVISOR">Supervisor</option>
          <option value="ADMIN">Admin</option>
        </select>
      </FormField>
      <StepError error={error} />
      <StickyMobileActionBar>
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onBack}>
            Back
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={onSkip} disabled={pending}>
            Skip
          </Button>
          <Button type="submit" className="h-11" disabled={pending}>
            {pending ? "Sending…" : "Invite"}
          </Button>
        </div>
      </StickyMobileActionBar>
    </ResponsiveForm>
  );
}

function ClientStep({
  pending,
  error,
  onBack,
  onSkip,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <ResponsiveForm action={onSubmit} className="flex-1">
      <h1 className="text-xl font-semibold tracking-tight">First client</h1>
      <p className="text-sm text-muted-foreground">
        Optional. Add a client and site so the first job has somewhere to land.
      </p>
      <FormField>
        <Label htmlFor="clientName">Client name</Label>
        <Input id="clientName" name="clientName" className="h-11" />
      </FormField>
      <FormField>
        <Label htmlFor="clientEmail">Client email</Label>
        <Input id="clientEmail" name="clientEmail" type="email" className="h-11" />
      </FormField>
      <FormField>
        <Label htmlFor="siteName">Site name</Label>
        <Input id="siteName" name="siteName" className="h-11" />
      </FormField>
      <FormField>
        <Label htmlFor="addressLine1">Street</Label>
        <Input id="addressLine1" name="addressLine1" className="h-11" />
      </FormField>
      <FormField>
        <Label htmlFor="city">City</Label>
        <Input id="city" name="city" className="h-11" />
      </FormField>
      <StepError error={error} />
      <StickyMobileActionBar>
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onBack}>
            Back
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={onSkip} disabled={pending}>
            Skip
          </Button>
          <Button type="submit" className="h-11" disabled={pending}>
            {pending ? "Saving…" : "Finish"}
          </Button>
        </div>
      </StickyMobileActionBar>
    </ResponsiveForm>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StepError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
