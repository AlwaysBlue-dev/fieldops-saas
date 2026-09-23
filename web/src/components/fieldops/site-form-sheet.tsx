"use client";

import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { StickyMobileActionBar } from "@/components/fieldops/sticky-mobile-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createSite,
  updateSite,
  type SiteRecord,
  type SiteWriteBody,
} from "@/lib/clients";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";
import { useState } from "react";

export function SiteFormSheet({
  open,
  onOpenChange,
  organizationId,
  clientId,
  site,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  clientId: string;
  site?: SiteRecord | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState({
    latitude: site?.latitude?.toString() ?? "",
    longitude: site?.longitude?.toString() ?? "",
  });

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={site ? "Edit site" : "Add site"}
      description="Service location for this customer. GPS is optional."
    >
      <ResponsiveForm
        className="min-h-[60dvh]"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const latitude = Number(form.get("latitude"));
          const longitude = Number(form.get("longitude"));
          const body: SiteWriteBody = {
            name: String(form.get("name") ?? ""),
            siteCode: String(form.get("siteCode") ?? "") || undefined,
            addressLine1: String(form.get("addressLine1") ?? ""),
            addressLine2: String(form.get("addressLine2") ?? "") || undefined,
            city: String(form.get("city") ?? ""),
            stateRegion: String(form.get("stateRegion") ?? "") || undefined,
            postalCode: String(form.get("postalCode") ?? "") || undefined,
            country: String(form.get("country") ?? ""),
            timezone: String(form.get("timezone") ?? "") || undefined,
            siteContactName: String(form.get("siteContactName") ?? "") || undefined,
            siteContactEmail: String(form.get("siteContactEmail") ?? "") || undefined,
            siteContactPhone: String(form.get("siteContactPhone") ?? "") || undefined,
            notes: String(form.get("notes") ?? "") || undefined,
          };
          if (Number.isFinite(latitude) && String(form.get("latitude"))) {
            body.latitude = latitude;
          }
          if (Number.isFinite(longitude) && String(form.get("longitude"))) {
            body.longitude = longitude;
          }
          setPending(true);
          setError(null);
          try {
            if (site) {
              await updateSite(organizationId, site.id, body);
            } else {
              await createSite(organizationId, clientId, body);
            }
            onOpenChange(false);
            onSaved();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not save site.");
          } finally {
            setPending(false);
          }
        }}
      >
        <FormField>
          <Label htmlFor="site-name">Site name</Label>
          <Input
            id="site-name"
            name="name"
            required
            defaultValue={site?.name ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="siteCode">Site code</Label>
          <Input
            id="siteCode"
            name="siteCode"
            defaultValue={site?.siteCode ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="addressLine1">Address</Label>
          <Input
            id="addressLine1"
            name="addressLine1"
            required
            defaultValue={site?.addressLine1 ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="addressLine2">Address line 2</Label>
          <Input
            id="addressLine2"
            name="addressLine2"
            defaultValue={site?.addressLine2 ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              required
              defaultValue={site?.city ?? ""}
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="stateRegion">State / region</Label>
            <Input
              id="stateRegion"
              name="stateRegion"
              defaultValue={site?.stateRegion ?? ""}
              className="h-11 md:h-8"
            />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField>
            <Label htmlFor="postalCode">Postal code</Label>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={site?.postalCode ?? ""}
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              name="country"
              required
              defaultValue={site?.country ?? "US"}
              className="h-11 md:h-8"
            />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField>
            <Label htmlFor="latitude">Latitude</Label>
            <Input
              id="latitude"
              name="latitude"
              inputMode="decimal"
              value={coords.latitude}
              onChange={(event) =>
                setCoords((current) => ({ ...current, latitude: event.target.value }))
              }
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="longitude">Longitude</Label>
            <Input
              id="longitude"
              name="longitude"
              inputMode="decimal"
              value={coords.longitude}
              onChange={(event) =>
                setCoords((current) => ({ ...current, longitude: event.target.value }))
              }
              className="h-11 md:h-8"
            />
          </FormField>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-8"
          disabled={locating}
          onClick={() => {
            if (!navigator.geolocation) {
              setError("This browser cannot provide a location.");
              return;
            }
            setLocating(true);
            setError(null);
            navigator.geolocation.getCurrentPosition(
              (position) => {
                setCoords({
                  latitude: position.coords.latitude.toFixed(7),
                  longitude: position.coords.longitude.toFixed(7),
                });
                setLocating(false);
              },
              () => {
                setError("Location was not available. You can enter coordinates manually.");
                setLocating(false);
              },
            );
          }}
        >
          {locating ? "Locating…" : "Use current location"}
        </Button>
        <FormField>
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={site?.timezone ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="siteContactName">Site contact</Label>
          <Input
            id="siteContactName"
            name="siteContactName"
            defaultValue={site?.siteContactName ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField>
            <Label htmlFor="siteContactEmail">Contact email</Label>
            <Input
              id="siteContactEmail"
              name="siteContactEmail"
              type="email"
              defaultValue={site?.siteContactEmail ?? ""}
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="siteContactPhone">Contact phone</Label>
            <Input
              id="siteContactPhone"
              name="siteContactPhone"
              defaultValue={site?.siteContactPhone ?? ""}
              className="h-11 md:h-8"
            />
          </FormField>
        </div>
        <FormField>
          <Label htmlFor="site-notes">Access notes</Label>
          <Textarea id="site-notes" name="notes" defaultValue={site?.notes ?? ""} rows={3} />
        </FormField>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <StickyMobileActionBar>
          <MutationButton type="submit" className="h-11 w-full md:h-8" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </MutationButton>
        </StickyMobileActionBar>
      </ResponsiveForm>
    </ResponsiveDrawer>
  );
}
