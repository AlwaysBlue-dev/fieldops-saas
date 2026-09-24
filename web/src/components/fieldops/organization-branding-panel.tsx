"use client";

import { OrgAvatar } from "@/components/fieldops/org-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  getOrganization,
  removeOrganizationLogo,
  uploadOrganizationLogo,
  type OrganizationDetail,
} from "@/lib/organizations";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function OrganizationBrandingPanel({
  organizationId,
  canManage,
}: {
  organizationId: string;
  canManage: boolean;
}) {
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);

  const load = useCallback(async () => {
    const next = await getOrganization(organizationId);
    setOrg(next);
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load branding.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!org) {
    return (
      <p className="text-sm text-muted-foreground">
        {error ?? "Loading branding…"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <OrgAvatar
          key={`${org.hasLogo}-${logoVersion}`}
          organizationId={organizationId}
          name={org.name}
          hasLogo={org.hasLogo}
          className="size-14 rounded-lg"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{org.name}</p>
          <p className="text-xs text-muted-foreground">
            {org.hasLogo ? "Custom logo" : "Initials fallback"}
          </p>
        </div>
      </div>

      {canManage ? (
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="org-logo">Upload logo</Label>
            <Input
              id="org-logo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-1.5"
              disabled={pending}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  setError("Logo must be 2 MB or smaller.");
                  return;
                }
                setPending(true);
                setError(null);
                try {
                  await uploadOrganizationLogo(organizationId, file);
                  await load();
                  setLogoVersion((value) => value + 1);
                  toast.success("Logo updated");
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Could not upload logo.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              JPEG, PNG, or WebP · max 2 MB
            </p>
          </div>
          {org.hasLogo ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full md:h-8 md:w-auto"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await removeOrganizationLogo(organizationId);
                  await load();
                  setLogoVersion((value) => value + 1);
                  toast.success("Logo removed");
                } catch (err) {
                  setError(
                    err instanceof ApiError ? err.message : "Could not remove logo.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Remove logo
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can change organization branding.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        <a
          href="/docs/storage-overview"
          className="text-primary underline-offset-2 hover:underline"
        >
          Learn about storage and branding
        </a>
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
