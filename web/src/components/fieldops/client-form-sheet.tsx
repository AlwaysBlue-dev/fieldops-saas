"use client";

import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { StickyMobileActionBar } from "@/components/fieldops/sticky-mobile-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createClient,
  updateClient,
  type ClientDetail,
  type ClientWriteBody,
} from "@/lib/clients";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";
import { useState } from "react";

export function ClientFormSheet({
  open,
  onOpenChange,
  organizationId,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  client?: ClientDetail | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={client ? "Edit account" : "New customer"}
      description="Customer record for dispatch, billing, and site work."
    >
      <ResponsiveForm
        className="min-h-[60dvh]"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const body: ClientWriteBody = {
            name: String(form.get("name") ?? ""),
            clientCode: String(form.get("clientCode") ?? "") || undefined,
            primaryContactName:
              String(form.get("primaryContactName") ?? "") || undefined,
            primaryContactEmail:
              String(form.get("primaryContactEmail") ?? "") || undefined,
            primaryContactPhone:
              String(form.get("primaryContactPhone") ?? "") || undefined,
            billingEmail: String(form.get("billingEmail") ?? "") || undefined,
            website: String(form.get("website") ?? "") || undefined,
            notes: String(form.get("notes") ?? "") || undefined,
          };
          setPending(true);
          setError(null);
          try {
            if (client) {
              await updateClient(organizationId, client.id, body);
            } else {
              await createClient(organizationId, body);
            }
            onOpenChange(false);
            onSaved();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not save client.");
          } finally {
            setPending(false);
          }
        }}
      >
        <FormField>
          <Label htmlFor="name">Account name</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="e.g. Northstar Apartments"
            defaultValue={client?.name ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="clientCode">Client code</Label>
          <Input
            id="clientCode"
            name="clientCode"
            placeholder="ACM-001"
            defaultValue={client?.clientCode ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField>
            <Label htmlFor="primaryContactName">Primary contact</Label>
            <Input
              id="primaryContactName"
              name="primaryContactName"
              placeholder="e.g. John Smith"
              defaultValue={client?.primaryContactName ?? ""}
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="primaryContactPhone">Phone</Label>
            <Input
              id="primaryContactPhone"
              name="primaryContactPhone"
              placeholder="e.g. +1 555 123 4567"
              defaultValue={client?.primaryContactPhone ?? ""}
              className="h-11 md:h-8"
            />
          </FormField>
        </div>
        <FormField>
          <Label htmlFor="primaryContactEmail">Contact email</Label>
          <Input
            id="primaryContactEmail"
            name="primaryContactEmail"
            type="email"
            placeholder="e.g. john@company.com"
            defaultValue={client?.primaryContactEmail ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="billingEmail">Billing email</Label>
          <Input
            id="billingEmail"
            name="billingEmail"
            type="email"
            placeholder="billing@client.com"
            defaultValue={client?.billingEmail ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            placeholder="https://client.com"
            defaultValue={client?.website ?? ""}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Account notes…"
            defaultValue={client?.notes ?? ""}
            rows={4}
          />
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
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full md:hidden"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </StickyMobileActionBar>
      </ResponsiveForm>
    </ResponsiveDrawer>
  );
}
