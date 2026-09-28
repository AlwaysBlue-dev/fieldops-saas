"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  listPlatformOrganizations,
  sendPlatformOwnerMessage,
  type PlatformOrganization,
} from "@/lib/platform";
import { OWNER_MESSAGE_CATEGORIES } from "@/lib/owner-inbox";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

export default function PlatformOwnerMessagesPage() {
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>(
    [],
  );
  const [organizationId, setOrganizationId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<(typeof OWNER_MESSAGE_CATEGORIES)[number]>("GENERAL");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaPath, setCtaPath] = useState("");
  const [pending, setPending] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listPlatformOrganizations()
      .then((rows) => {
        if (cancelled) return;
        setOrganizations(rows);
        setLoadingOrgs(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingOrgs(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!organizationId || !subject.trim() || !message.trim()) {
      toast.error("Organization, subject, and message are required.");
      return;
    }
    setPending(true);
    try {
      const result = await sendPlatformOwnerMessage({
        organizationId,
        subject: subject.trim(),
        message: message.trim(),
        category,
        ...(ctaLabel.trim() ? { ctaLabel: ctaLabel.trim() } : {}),
        ...(ctaPath.trim() ? { ctaPath: ctaPath.trim() } : {}),
      });
      toast.success(
        `Message sent to ${result.recipientCount} owner${result.recipientCount === 1 ? "" : "s"} at ${result.organization.name}.`,
      );
      setSubject("");
      setMessage("");
      setCtaLabel("");
      setCtaPath("");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not send the owner message.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Owner messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send an account, billing, or maintenance notice to the current owner
          of a selected organization. Messages appear in their workspace Inbox.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="organizationId">Organization</Label>
          <select
            id="organizationId"
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={organizationId}
            disabled={loadingOrgs || pending}
            onChange={(event) => setOrganizationId(event.target.value)}
            required
          >
            <option value="">
              {loadingOrgs ? "Loading organizations…" : "Select organization"}
            </option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.slug})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={category}
            disabled={pending}
            onChange={(event) =>
              setCategory(
                event.target.value as (typeof OWNER_MESSAGE_CATEGORIES)[number],
              )
            }
          >
            {OWNER_MESSAGE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            maxLength={200}
            disabled={pending}
            onChange={(event) => setSubject(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Message</Label>
          <textarea
            id="message"
            className="min-h-36 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            value={message}
            maxLength={8000}
            disabled={pending}
            onChange={(event) => setMessage(event.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ctaLabel">CTA label (optional)</Label>
            <Input
              id="ctaLabel"
              value={ctaLabel}
              maxLength={80}
              disabled={pending}
              placeholder="Open Billing"
              onChange={(event) => setCtaLabel(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ctaPath">Internal path (optional)</Label>
            <Input
              id="ctaPath"
              value={ctaPath}
              maxLength={200}
              disabled={pending}
              placeholder="/settings/billing"
              onChange={(event) => setCtaPath(event.target.value)}
            />
          </div>
        </div>

        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>
          {pending ? "Sending…" : "Send to owner"}
        </Button>
      </form>
    </div>
  );
}
