"use client";

import { useRefreshLoader } from "@/components/fieldops/data-refresh-provider";
import {
  IndustrySelect,
  type IndustrySelection,
} from "@/components/fieldops/industry-select";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { TimezoneCombobox } from "@/components/fieldops/timezone-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  canEditOrganizationSettings,
  resolveCurrentMembership,
} from "@/lib/current-org";
import { isValidIanaTimeZone } from "@/lib/iana-timezones";
import {
  parseIndustrySelection,
  resolveIndustryForSubmit,
} from "@/lib/industry";
import {
  getOrganization,
  updateOrganization,
  updateOrganizationSettings,
  type OrganizationDetail,
  type WorkWeekDay,
} from "@/lib/organizations";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const WEEK: { id: WorkWeekDay; label: string }[] = [
  { id: "MON", label: "Monday" },
  { id: "TUE", label: "Tuesday" },
  { id: "WED", label: "Wednesday" },
  { id: "THU", label: "Thursday" },
  { id: "FRI", label: "Friday" },
  { id: "SAT", label: "Saturday" },
  { id: "SUN", label: "Sunday" },
];

export function SettingsOrganizationSection({ orgSlug }: { orgSlug: string }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [requireSignature, setRequireSignature] = useState(true);
  const [requireGps, setRequireGps] = useState(true);
  const [dailyHours, setDailyHours] = useState(8);
  const [workingWeek, setWorkingWeek] = useState<WorkWeekDay[]>([]);
  const [industrySelection, setIndustrySelection] =
    useState<IndustrySelection>("");
  const [industryCustom, setIndustryCustom] = useState("");
  const [industryError, setIndustryError] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(orgSlug)
      .then(async (membership) => {
        if (cancelled || !membership) return;
        setOrganizationId(membership.organization.id);
        setCanManage(canEditOrganizationSettings(membership));
        const detail = await getOrganization(membership.organization.id);
        if (cancelled) return;
        setOrg(detail);
        setName(detail.name);
        setPhone(detail.phone ?? "");
        setTimezone(detail.timezone);
        setWorkingWeek(detail.settings?.workingWeek ?? []);
        setRequireSignature(detail.settings?.requireClientSignature ?? true);
        setRequireGps(detail.settings?.requireGps ?? true);
        setDailyHours(detail.settings?.defaultDailyHoursLimit ?? 8);
        const parsed = parseIndustrySelection(detail.industry);
        setIndustrySelection(parsed.selection);
        setIndustryCustom(parsed.custom);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const draftVersion = JSON.stringify([requireSignature, requireGps, dailyHours, name, phone, timezone, workingWeek, industrySelection, industryCustom, pending]);
  const latestDraft = useRef(draftVersion);
  useEffect(() => { latestDraft.current = draftVersion; }, [draftVersion]);

  useRefreshLoader(async () => {
    if (!organizationId || !org) return;
    const parsed = parseIndustrySelection(org.industry);
    const dirty = requireSignature !== org.settings?.requireClientSignature || requireGps !== org.settings?.requireGps || dailyHours !== org.settings?.defaultDailyHoursLimit || pending || name !== org.name || phone !== (org.phone ?? "") ||
      timezone !== org.timezone || JSON.stringify(workingWeek) !== JSON.stringify(org.settings?.workingWeek ?? []) ||
      industrySelection !== parsed.selection || industryCustom !== parsed.custom;
    const detail = await getOrganization(organizationId);
    // Never replace the draft's baseline while it contains local edits.
    if (canManage && (dirty || latestDraft.current !== draftVersion)) return;
    setOrg(detail);
    setName(detail.name);
    setPhone(detail.phone ?? "");
    setTimezone(detail.timezone);
    setWorkingWeek(detail.settings?.workingWeek ?? []);
    setRequireSignature(detail.settings?.requireClientSignature ?? true);
    setRequireGps(detail.settings?.requireGps ?? true);
    setDailyHours(detail.settings?.defaultDailyHoursLimit ?? 8);
    const nextIndustry = parseIndustrySelection(detail.industry);
    setIndustrySelection(nextIndustry.selection);
    setIndustryCustom(nextIndustry.custom);
  });

  if (!organizationId || !org) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!canManage) {
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Company name</dt>
          <dd className="font-medium">{org.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Business type</dt>
          <dd className="font-medium">{org.industry?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Timezone</dt>
          <dd className="font-medium">{org.timezone}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="font-medium">{org.phone?.trim() || "—"}</dd>
        </div>
        <div><dt className="text-muted-foreground">Required client signature</dt><dd>{org.settings?.requireClientSignature ? "On" : "Off"}</dd></div>
        <div><dt className="text-muted-foreground">Required GPS on clock events</dt><dd>{org.settings?.requireGps ? "On" : "Off"}</dd></div>
        <div><dt className="text-muted-foreground">Normal Day Hours</dt><dd>{org.settings?.defaultDailyHoursLimit}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Normal working week</dt>
          <dd className="font-medium">
            {(org.settings?.workingWeek ?? []).length > 0
              ? (org.settings?.workingWeek ?? [])
                  .map((day) => WEEK.find((item) => item.id === day)?.label ?? day)
                  .join(", ")
              : "—"}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setIndustryError(null);
        setTimezoneError(null);
        setWeekError(null);

        const industryResult = resolveIndustryForSubmit(
          industrySelection,
          industryCustom,
        );
        if (!industryResult.ok) {
          setIndustryError(industryResult.message);
          return;
        }
        if (!timezone || !isValidIanaTimeZone(timezone)) {
          setTimezoneError("Please select a valid timezone.");
          return;
        }
        if (workingWeek.length === 0) {
          setWeekError("Select at least one working day.");
          return;
        }

        if (!Number.isFinite(dailyHours) || dailyHours < 1 || dailyHours > 24) {
          toast.error("Normal Day Hours must be between 1 and 24.");
          return;
        }
        setPending(true);
        try {
          const updated = await updateOrganization(organizationId, {
            name: name.trim(),
            phone: phone.trim() || undefined,
            industry: industryResult.industry,
            timezone,
          });
          const withSettings = await updateOrganizationSettings(organizationId, {
            workingWeek,
            requireClientSignature: requireSignature,
            requireGps,
            defaultDailyHoursLimit: dailyHours,
          });
          setOrg({ ...updated, settings: withSettings.settings ?? updated.settings });
          setWorkingWeek(withSettings.settings?.workingWeek ?? workingWeek);
          setRequireSignature(withSettings.settings?.requireClientSignature ?? requireSignature);
          setRequireGps(withSettings.settings?.requireGps ?? requireGps);
          setDailyHours(withSettings.settings?.defaultDailyHoursLimit ?? dailyHours);
          toast.success("Organization profile saved.");
        } catch (error) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Could not save organization settings.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-name">Company name</Label>
        <Input
          id="org-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ABC Electrical Services"
          required
          minLength={2}
          maxLength={120}
          className="h-11 md:h-9"
        />
      </div>
      <IndustrySelect
        id="org-industry"
        selection={industrySelection}
        custom={industryCustom}
        onSelectionChange={(next) => {
          setIndustrySelection(next);
          setIndustryError(null);
        }}
        onCustomChange={(next) => {
          setIndustryCustom(next);
          setIndustryError(null);
        }}
        required
        error={industryError}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-timezone">Timezone</Label>
        <TimezoneCombobox
          id="org-timezone"
          value={timezone}
          onChange={(next) => {
            setTimezone(next);
            setTimezoneError(null);
          }}
        />
        {timezoneError ? (
          <p role="alert" className="text-sm text-destructive">
            {timezoneError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Used for schedules, timesheets, overtime, and “today” boundaries.
          </p>
        )}
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" role="switch" className="mt-1 size-4 accent-primary" checked={requireSignature} onChange={(event) => setRequireSignature(event.target.checked)} />
        <span><span className="font-medium">Required client signature</span><span className="block text-muted-foreground">Require a client signature before applicable work can be submitted/completed.</span></span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" role="switch" className="mt-1 size-4 accent-primary" checked={requireGps} onChange={(event) => setRequireGps(event.target.checked)} />
        <span><span className="font-medium">Required GPS on clock events</span><span className="block text-muted-foreground">Require location when users clock in or clock out.</span></span>
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="normal-day-hours">Normal Day Hours</Label>
        <Input id="normal-day-hours" type="number" min={1} max={24} step="0.01" required value={Number.isFinite(dailyHours) ? dailyHours : ""} onChange={(event) => setDailyHours(event.target.valueAsNumber)} />
        <p className="text-xs text-muted-foreground">Standard number of working hours in a normal workday.</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Normal Working Week</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEEK.map((day) => {
            const active = workingWeek.includes(day.id);
            return (
              <label
                key={day.id}
                className={cn(
                  "flex h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm md:h-9",
                  active
                    ? "border-primary bg-accent/40 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={active}
                  onChange={() => {
                    setWeekError(null);
                    setWorkingWeek((current) =>
                      active
                        ? current.filter((item) => item !== day.id)
                        : [...current, day.id],
                    );
                  }}
                />
                <span>{day.label}</span>
              </label>
            );
          })}
        </div>
        {weekError ? (
          <p role="alert" className="mt-1.5 text-sm text-destructive">
            {weekError}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Scheduling outside these days shows a confirmation warning.
          </p>
        )}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-phone">Phone</Label>
        <Input
          id="org-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="e.g. +1 555 123 4567"
          className="h-11 md:h-9"
        />
      </div>
      <MutationButton type="submit" className="h-11 w-fit md:h-8" disabled={pending}>
        {pending ? "Saving…" : "Save organization"}
      </MutationButton>
    </form>
  );
}
