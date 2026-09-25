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
import { canInviteMembers, resolveCurrentMembership } from "@/lib/current-org";
import { isValidIanaTimeZone } from "@/lib/iana-timezones";
import {
  parseIndustrySelection,
  resolveIndustryForSubmit,
} from "@/lib/industry";
import {
  getOrganization,
  updateOrganization,
  type OrganizationDetail,
} from "@/lib/organizations";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function SettingsOrganizationSection({ orgSlug }: { orgSlug: string }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [industrySelection, setIndustrySelection] =
    useState<IndustrySelection>("");
  const [industryCustom, setIndustryCustom] = useState("");
  const [industryError, setIndustryError] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(orgSlug)
      .then(async (membership) => {
        if (cancelled || !membership) return;
        setOrganizationId(membership.organization.id);
        setCanManage(canInviteMembers(membership));
        const detail = await getOrganization(membership.organization.id);
        if (cancelled) return;
        setOrg(detail);
        setName(detail.name);
        setPhone(detail.phone ?? "");
        setTimezone(detail.timezone);
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

        setPending(true);
        try {
          const updated = await updateOrganization(organizationId, {
            name: name.trim(),
            phone: phone.trim() || undefined,
            industry: industryResult.industry,
            timezone,
          });
          setOrg(updated);
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-phone">Phone</Label>
        <Input
          id="org-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-11 md:h-9"
        />
      </div>
      <MutationButton type="submit" className="h-11 w-fit md:h-8" disabled={pending}>
        {pending ? "Saving…" : "Save organization"}
      </MutationButton>
    </form>
  );
}
