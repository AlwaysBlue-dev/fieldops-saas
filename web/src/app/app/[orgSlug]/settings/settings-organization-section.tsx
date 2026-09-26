"use client";

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
import { useEffect, useState } from "react";
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
        const parsed = parseIndustrySelection(detail.industry);
        setIndustrySelection(parsed.selection);
        setIndustryCustom(parsed.custom);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

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
          });
          setOrg({ ...updated, settings: withSettings.settings ?? updated.settings });
          setWorkingWeek(withSettings.settings?.workingWeek ?? workingWeek);
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
