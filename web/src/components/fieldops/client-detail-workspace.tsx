"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FormField } from "@/components/fieldops/responsive-form";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import {
  createSiteContact,
  deactivateClient,
  deactivateSite,
  formatSiteAddress,
  getClient,
  mapsUrl,
  type ClientDetail,
  type SiteRecord,
} from "@/lib/clients";
import { canManageCustomers, resolveCurrentMembership } from "@/lib/current-org";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientFormSheet } from "./client-form-sheet";
import { MutationButton } from "./mutation-control";
import { SiteFormSheet } from "./site-form-sheet";

export function ClientDetailWorkspace() {
  const params = useParams<{ orgSlug: string; clientId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled || !membership) {
          if (!cancelled) {
            setError("Organization not found");
            setStatus("error");
          }
          return;
        }
        setOrganizationId(membership.organization.id);
        setCanManage(canManageCustomers(membership));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load client.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const next = await getClient(organizationId, params.clientId);
    setClient(next);
    setStatus("ready");
  }, [organizationId, params.clientId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    getClient(organizationId, params.clientId)
      .then((next) => {
        if (cancelled) return;
        setClient(next);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load client.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, params.clientId]);

  if (status === "loading") {
    return <SkeletonBlock rows={8} />;
  }
  if (status === "error" || !organizationId || !client) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  const contacts = client.sites.flatMap((site) =>
    (site.contacts ?? []).map((contact) => ({ ...contact, siteName: site.name })),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <p className="text-sm">
        <Link href={`/app/${params.orgSlug}/clients`} className="text-primary">
          All customers
        </Link>
      </p>

      <header className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
              <StatusPill
                label={client.status === "ACTIVE" ? "Active" : "Inactive"}
                tone={client.status === "ACTIVE" ? "emerald" : "muted"}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {client.clientCode ? `${client.clientCode} · ` : ""}
              {client.siteCount} site{client.siteCount === 1 ? "" : "s"}
              {client.primaryContactName ? ` · ${client.primaryContactName}` : ""}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <MutationButton
                variant="outline"
                className="h-11 md:h-8"
                onClick={() => setEditOpen(true)}
              >
                Edit
              </MutationButton>
              {client.status === "ACTIVE" ? (
                <MutationButton
                  variant="outline"
                  className="h-11 md:h-8"
                  onClick={async () => {
                    await deactivateClient(organizationId, client.id);
                    await load();
                  }}
                >
                  Deactivate
                </MutationButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="h-11 w-full justify-start overflow-x-auto md:h-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-3">
          <section className="rounded-lg border border-border bg-card px-4 py-4">
            <h2 className="type-label text-muted-foreground">Primary contact</h2>
            <p className="mt-2 text-sm font-medium">
              {client.primaryContactName ?? "Not set"}
            </p>
            <p className="text-sm text-muted-foreground">
              {[client.primaryContactEmail, client.primaryContactPhone]
                .filter(Boolean)
                .join(" · ") || "No email or phone on file"}
            </p>
            {client.billingEmail ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Billing · {client.billingEmail}
              </p>
            ) : null}
            {client.notes ? <p className="mt-3 text-sm">{client.notes}</p> : null}
          </section>
          <section className="rounded-lg border border-border bg-card px-4 py-4">
            <h2 className="type-label text-muted-foreground">Recent activity</h2>
            {client.activity.length === 0 && !client.lastJob ? (
              <EmptyState
                title="No activity yet"
                description="Jobs and account changes for this customer will appear here."
              />
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {client.lastJob ? (
                  <li className="text-sm">
                    Latest job {client.lastJob.jobNumber} · {client.lastJob.title}
                  </li>
                ) : null}
                {client.activity.map((item) => (
                  <li key={item.id} className="text-sm text-muted-foreground">
                    {item.action.replaceAll("_", " ")} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="sites" className="mt-4 flex flex-col gap-3">
          {canManage ? (
            <MutationButton
              className="h-11 w-full sm:w-auto md:h-8"
              onClick={() => {
                setEditingSite(null);
                setSiteOpen(true);
              }}
            >
              Add Site
            </MutationButton>
          ) : null}
          {client.sites.length === 0 ? (
            <EmptyState
              title="No sites yet"
              description="Add a service location when this account has somewhere to dispatch."
            />
          ) : (
            client.sites.map((site) => {
              const map = mapsUrl(site);
              return (
                <article
                  key={site.id}
                  className="rounded-lg border border-border bg-card px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{site.name}</h3>
                        <StatusPill
                          label={site.status === "ACTIVE" ? "Active" : "Inactive"}
                          tone={site.status === "ACTIVE" ? "emerald" : "muted"}
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatSiteAddress(site) || "Address not complete"}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="flex gap-2">
                        <MutationButton
                          variant="outline"
                          className="h-11 md:h-8"
                          onClick={() => {
                            setEditingSite(site);
                            setSiteOpen(true);
                          }}
                        >
                          Edit
                        </MutationButton>
                        {site.status === "ACTIVE" ? (
                          <MutationButton
                            variant="ghost"
                            className="h-11 md:h-8"
                            onClick={async () => {
                              await deactivateSite(organizationId, site.id);
                              await load();
                            }}
                          >
                            Deactivate
                          </MutationButton>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {map ? (
                    <a
                      href={map}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex h-11 items-center text-sm text-primary md:h-8"
                    >
                      Open in Maps
                    </a>
                  ) : null}
                </article>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="contacts" className="mt-4 flex flex-col gap-3">
          {client.primaryContactName ? (
            <article className="rounded-lg border border-border bg-card px-4 py-4">
              <p className="type-label text-muted-foreground">Account contact</p>
              <p className="mt-1 text-sm font-medium">{client.primaryContactName}</p>
              <p className="text-sm text-muted-foreground">
                {[client.primaryContactEmail, client.primaryContactPhone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </article>
          ) : null}
          {contacts.length === 0 ? (
            <EmptyState
              title="No site contacts"
              description="Site contacts appear here once a location has people on file."
            />
          ) : (
            contacts.map((contact) => (
              <article
                key={contact.id}
                className="rounded-lg border border-border bg-card px-4 py-4"
              >
                <p className="text-sm font-medium">{contact.name}</p>
                <p className="text-sm text-muted-foreground">
                  {contact.siteName}
                  {contact.title ? ` · ${contact.title}` : ""}
                  {contact.isPrimary ? " · Primary" : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[contact.email, contact.phone].filter(Boolean).join(" · ") ||
                    "No phone or email"}
                </p>
              </article>
            ))
          )}
          {canManage && client.sites[0] ? (
            <ContactQuickAdd
              organizationId={organizationId}
              siteId={client.sites[0].id}
              siteName={client.sites[0].name}
              onSaved={() => void load()}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          {client.jobs.length === 0 ? (
            <EmptyState
              title="No jobs for this customer"
              description="Work orders attached to this account will list here. None are invented for the view."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {client.jobs.map((job) => (
                <li
                  key={job.id}
                  className="rounded-lg border border-border bg-card px-4 py-3"
                >
                  <p className="text-sm font-medium">
                    {job.jobNumber} · {job.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {job.status.replaceAll("_", " ")}
                    {job.scheduledStart
                      ? ` · ${new Date(job.scheduledStart).toLocaleDateString()}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <ClientFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        organizationId={organizationId}
        client={client}
        onSaved={() => void load()}
      />
      <SiteFormSheet
        open={siteOpen}
        onOpenChange={setSiteOpen}
        organizationId={organizationId}
        clientId={client.id}
        site={editingSite}
        onSaved={() => void load()}
      />
    </div>
  );
}

function ContactQuickAdd({
  organizationId,
  siteId,
  siteName,
  onSaved,
}: {
  organizationId: string;
  siteId: string;
  siteName: string;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="rounded-lg border border-border bg-card px-4 py-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        try {
          await createSiteContact(organizationId, siteId, {
            name: String(form.get("name") ?? ""),
            title: String(form.get("title") ?? "") || undefined,
            email: String(form.get("email") ?? "") || undefined,
            phone: String(form.get("phone") ?? "") || undefined,
            isPrimary: true,
          });
          event.currentTarget.reset();
          onSaved();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not add contact.");
        }
      }}
    >
      <h2 className="text-sm font-semibold">Add contact at {siteName}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField>
          <Label htmlFor="contact-name">Name</Label>
          <Input id="contact-name" name="name" required className="h-11 md:h-8" />
        </FormField>
        <FormField>
          <Label htmlFor="contact-title">Title</Label>
          <Input id="contact-title" name="title" className="h-11 md:h-8" />
        </FormField>
        <FormField>
          <Label htmlFor="contact-email">Email</Label>
          <Input id="contact-email" name="email" type="email" className="h-11 md:h-8" />
        </FormField>
        <FormField>
          <Label htmlFor="contact-phone">Phone</Label>
          <Input id="contact-phone" name="phone" className="h-11 md:h-8" />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <MutationButton type="submit" className="mt-3 h-11 md:h-8">
        Save contact
      </MutationButton>
    </form>
  );
}
