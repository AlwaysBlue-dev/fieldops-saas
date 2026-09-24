"use client";

import { organizationInitials } from "@/lib/person-label";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { resolveOrganizationLogoUrl } from "@/lib/organizations";

export function OrgAvatar({
  organizationId,
  name,
  hasLogo,
  className,
  inverted = false,
}: {
  organizationId: string;
  name: string;
  hasLogo?: boolean;
  className?: string;
  inverted?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!hasLogo) {
      setSrc(null);
      return;
    }
    resolveOrganizationLogoUrl(organizationId)
      .then((url) => {
        if (cancelled) {
          if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (revoked?.startsWith("blob:")) URL.revokeObjectURL(revoked);
    };
  }, [organizationId, hasLogo]);

  const initials = organizationInitials(name);

  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-[11px] font-semibold tracking-tight text-muted-foreground ring-1 ring-border",
        inverted && "bg-white/12 text-white ring-white/15",
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-contain p-0.5" />
      ) : (
        initials
      )}
    </span>
  );
}
