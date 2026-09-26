"use client";

/* Camera previews are local object URLs, not public Next image hosts. */
/* eslint-disable @next/next/no-img-element */

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { GeolocationErrorDialog } from "@/components/fieldops/geolocation-error-dialog";
import { SignaturePad, type SignaturePadHandle } from "@/components/fieldops/signature-pad";
import { uploadJobFile } from "@/lib/job-files";
import { MutationButton, useCanMutate } from "@/components/fieldops/mutation-control";
import { ResponsiveDrawer } from "@/components/fieldops/responsive-drawer";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { resolveCurrentMembership } from "@/lib/current-org";
import {
  GeolocationRequestError,
  isGeolocationRequestError,
} from "@/lib/geolocation";
import { priorityTone, statusLabel, statusTone } from "@/lib/jobs";
import {
  addJobMaterial,
  addJobSignature,
  addWorkUpdate,
  clockIn,
  clockOut,
  getMyDay,
  readGps,
  weekdayLabel,
  type MyDayJob,
  type MyDayPayload,
} from "@/lib/my-day";
import {
  formatAccuracy,
  formatDistanceFromSite,
  locationStatusLabel,
  locationStatusTone,
} from "@/lib/location";
import { formatDateTimeInZone, formatTimeInZone } from "@/lib/timezone";
import { Camera, ClipboardPen, Navigation, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SheetKind = "update" | "photo" | "material" | "signoff" | null;
type PendingClock = { kind: "in" | "out"; jobId?: string };

export function MyDayWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const { canMutate } = useCanMutate();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [day, setDay] = useState<MyDayPayload | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<GeolocationRequestError | null>(null);
  const [pendingClock, setPendingClock] = useState<PendingClock | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [activeJob, setActiveJob] = useState<MyDayJob | null>(null);

  useEffect(() => {
    const sync = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled) return;
        if (!membership) {
          setError("Organization not found");
          setLoadState("error");
          return;
        }
        setOrganizationId(membership.organization.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load My Day.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    getMyDay(organizationId)
      .then((payload) => {
        if (cancelled) return;
        setDay(payload);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load My Day.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const refresh = async () => {
    if (!organizationId) return;
    const payload = await getMyDay(organizationId);
    setDay(payload);
    setLoadState("ready");
  };

  const requireConnection = () => {
    if (!online) {
      setActionError("You’re offline. Reconnect to clock or add job evidence.");
      return false;
    }
    return true;
  };

  const withGps = async () => {
    const required = Boolean(day?.settings.requireGps);
    if (required) {
      setLocating(true);
      try {
        const gps = await readGps(true);
        return gps ?? {};
      } finally {
        setLocating(false);
      }
    }
    setLocating(true);
    try {
      return (await readGps(false)) ?? {};
    } finally {
      setLocating(false);
    }
  };

  const runClock = async (kind: "in" | "out", jobId?: string) => {
    if (!organizationId || !requireConnection()) return;
    if (pending || locating) return;
    setPending(true);
    setActionError(null);
    setGeoError(null);
    try {
      const gps = await withGps();
      if (kind === "in") {
        await clockIn(organizationId, { ...gps, jobId });
      } else {
        await clockOut(organizationId, gps);
      }
      setPendingClock(null);
      await refresh();
    } catch (err) {
      if (isGeolocationRequestError(err)) {
        setPendingClock({ kind, jobId });
        setGeoError(err);
        return;
      }
      setActionError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Clock failed.",
      );
    } finally {
      setPending(false);
      setLocating(false);
    }
  };

  const openSheet = (kind: SheetKind, job: MyDayJob) => {
    setActiveJob(job);
    setSheet(kind);
    setActionError(null);
  };

  if (loadState === "error") {
    return (
      <ErrorState
        title="Could not load My Day"
        description={error ?? "Check your connection and try again."}
        onRetry={() => {
          if (!organizationId) return;
          setLoadState("loading");
          getMyDay(organizationId)
            .then((payload) => {
              setDay(payload);
              setLoadState("ready");
            })
            .catch((err: unknown) => {
              setError(err instanceof ApiError ? err.message : "Could not load My Day.");
              setLoadState("error");
            });
        }}
      />
    );
  }

  if (loadState === "loading" || !day) {
    return <SkeletonBlock rows={8} />;
  }

  const clockedIn = day.clock.status === "CLOCKED_IN";
  const clockJob =
    day.currentJob && day.clock.session?.jobId === day.currentJob.id
      ? day.currentJob
      : day.upcomingJobs.find((job) => job.id === day.clock.session?.jobId) ??
        day.currentJob;
  const empty = !day.currentJob && day.upcomingJobs.length === 0;
  const blocked = !canMutate || !online || pending || locating;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-28 md:max-w-3xl md:pb-0">
      {!online ? (
        <div className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          You’re offline. My Day can still show the last loaded day, but clock and
          job actions need a connection.
        </div>
      ) : null}

      <header className="flex flex-col gap-1">
        <p className="type-label text-muted-foreground">My Day</p>
        <h1 className="text-[1.35rem] font-semibold tracking-tight md:text-xl">
          {weekdayLabel(day.shift.weekday)} · {formatShiftDate(day.shift.date)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {day.shift.isWorkingDay ? "Working day" : "Non-working day"} ·{" "}
          {day.shift.timeZone.replaceAll("_", " ")}
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="type-label text-muted-foreground">Clock</p>
            <p className="mt-1 text-base font-semibold">
              {clockedIn && day.clock.session
                ? `Clocked in ${formatTimeInZone(day.clock.session.clockInAt, day.shift.timeZone)}`
                : "Not clocked in"}
            </p>
            {clockedIn && day.clock.session?.clockInEvidence ? (
              <ClockLocationLines evidence={day.clock.session.clockInEvidence} />
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Server time is recorded when you clock. Location is captured only
                at clock in or out.
              </p>
            )}
            {clockedIn && clockJob ? (
              <p className="mt-1 text-sm">
                On {clockJob.jobNumber} · {clockJob.title}
              </p>
            ) : null}
          </div>
          <StatusPill
            label={
              clockedIn && day.clock.session?.clockInEvidence
                ? locationStatusLabel(day.clock.session.clockInEvidence.locationStatus)
                : clockedIn
                  ? "On the clock"
                  : "Off the clock"
            }
            tone={
              clockedIn && day.clock.session?.clockInEvidence
                ? locationStatusTone(day.clock.session.clockInEvidence.locationStatus)
                : clockedIn
                  ? "teal"
                  : "muted"
            }
            live={clockedIn}
          />
        </div>
        {day.clock.session?.clockInEvidence?.mapsUrl ? (
          <Button asChild variant="outline" className="mt-3 h-11 w-full">
            <a
              href={day.clock.session.clockInEvidence.mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation className="size-4" />
              Open in Maps
            </a>
          </Button>
        ) : null}
        <MutationButton
          className="mt-4 h-14 w-full text-base font-semibold md:h-12"
          disabled={
            blocked ||
            pending ||
            locating ||
            (clockedIn ? !day.actions.canClockOut : !day.actions.canClockIn)
          }
          onClick={() =>
            void runClock(
              clockedIn ? "out" : "in",
              clockedIn ? undefined : (clockJob?.id ?? day.currentJob?.id),
            )
          }
        >
          {locating
            ? "Getting your current location…"
            : pending
              ? "Saving…"
              : clockedIn
                ? "Clock out"
                : "Clock in"}
        </MutationButton>
      </section>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {empty ? (
        <EmptyState
          title="No jobs on your board today"
          description="When dispatch assigns you work, it will land here with the site, time, and next action."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {day.currentJob ? (
            <section className="lg:col-span-2">
              <p className="type-label mb-2 text-muted-foreground">Current job</p>
              <JobCard
                job={day.currentJob}
                orgSlug={params.orgSlug}
                timeZone={day.shift.timeZone}
                current
                blocked={blocked}
                onClockIn={() => void runClock("in", day.currentJob!.id)}
                onClockOut={() => void runClock("out")}
                onAction={openSheet}
              />
            </section>
          ) : null}
          {day.upcomingJobs.length > 0 ? (
            <section className="lg:col-span-2">
              <p className="type-label mb-2 text-muted-foreground">Next up</p>
              <div className="flex flex-col gap-3">
                {day.upcomingJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    orgSlug={params.orgSlug}
                    timeZone={day.shift.timeZone}
                    blocked={blocked}
                    onClockIn={() => void runClock("in", job.id)}
                    onClockOut={() => void runClock("out")}
                    onAction={openSheet}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <FieldSheets
        key={`${sheet ?? "closed"}-${activeJob?.id ?? "none"}`}
        open={sheet}
        job={activeJob}
        organizationId={organizationId}
        online={online}
        canMutate={canMutate}
        onClose={() => setSheet(null)}
        onSaved={async () => {
          setSheet(null);
          await refresh();
        }}
      />

      <GeolocationErrorDialog
        open={Boolean(geoError)}
        error={geoError}
        pending={locating || pending}
        onCancel={() => {
          setGeoError(null);
          setPendingClock(null);
        }}
        onRetry={() => {
          if (!pendingClock) return;
          void runClock(pendingClock.kind, pendingClock.jobId);
        }}
      />
    </div>
  );
}

function JobCard({
  job,
  orgSlug,
  timeZone,
  current = false,
  blocked,
  onClockIn,
  onClockOut,
  onAction,
}: {
  job: MyDayJob;
  orgSlug: string;
  timeZone: string;
  current?: boolean;
  blocked: boolean;
  onClockIn: () => void;
  onClockOut: () => void;
  onAction: (kind: SheetKind, job: MyDayJob) => void;
}) {
  const windowLabel = job.scheduledStart
    ? `${formatTimeInZone(job.scheduledStart, timeZone)}${
        job.expectedFinish ? `–${formatTimeInZone(job.expectedFinish, timeZone)}` : ""
      }`
    : formatDateTimeInZone(job.scheduledStart, timeZone);

  return (
    <article className="rounded-lg border border-border bg-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-numeric text-xs font-semibold text-primary">
            {job.jobNumber}
            {current ? " · Now" : ""}
          </p>
          <h2 className="mt-0.5 text-base font-semibold leading-snug">{job.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.client.name}
            {job.site.name ? ` · ${job.site.name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
          <StatusPill label={job.priority} tone={priorityTone(job.priority)} />
        </div>
      </div>

      <p className="type-numeric mt-3 text-sm font-medium">{windowLabel}</p>
      {job.scopeSummary ? (
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{job.scopeSummary}</p>
      ) : null}

      {job.site.addressLabel ? (
        <p className="mt-3 text-sm">{job.site.addressLabel}</p>
      ) : null}
      {job.siteContact ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {job.siteContact.name ?? "Site contact"}
          {job.siteContact.phone ? ` · ${job.siteContact.phone}` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {job.navigationUrl ? (
          <Button asChild variant="outline" className="h-11">
            <a href={job.navigationUrl} target="_blank" rel="noreferrer">
              <Navigation className="size-4" />
              Navigate
            </a>
          </Button>
        ) : (
          <Button variant="outline" className="h-11" disabled>
            <Navigation className="size-4" />
            Navigate
          </Button>
        )}
        {job.siteContact?.phone ? (
          <Button asChild variant="outline" className="h-11">
            <a href={`tel:${job.siteContact.phone}`}>
              <Phone className="size-4" />
              Call
            </a>
          </Button>
        ) : (
          <Button asChild variant="outline" className="h-11">
            <Link href={`/app/${orgSlug}/jobs/${job.id}`}>Open job</Link>
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant="secondary" className="h-11 min-w-11 flex-1">
          <Link href={`/app/${orgSlug}/jobs/${job.id}`}>Open job</Link>
        </Button>
        {job.actions.canClockIn ? (
          <MutationButton className="h-11 flex-1" disabled={blocked} onClick={onClockIn}>
            Clock in
          </MutationButton>
        ) : null}
        {job.actions.canClockOut ? (
          <MutationButton className="h-11 flex-1" disabled={blocked} onClick={onClockOut}>
            Clock out
          </MutationButton>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          disabled={blocked || !job.actions.canAddWorkUpdate}
          onClick={() => onAction("update", job)}
        >
          <ClipboardPen className="size-4" />
          Update
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          disabled={blocked || !job.actions.canAddPhoto}
          onClick={() => onAction("photo", job)}
        >
          <Camera className="size-4" />
          Photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          disabled={blocked || !job.actions.canAddMaterial}
          onClick={() => onAction("material", job)}
        >
          <Plus className="size-4" />
          Material
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          disabled={blocked || !job.actions.canSignOff}
          onClick={() => onAction("signoff", job)}
        >
          Sign-off
        </Button>
      </div>
    </article>
  );
}

function FieldSheets({
  open,
  job,
  organizationId,
  online,
  canMutate,
  onClose,
  onSaved,
}: {
  open: SheetKind;
  job: MyDayJob | null;
  organizationId: string | null;
  online: boolean;
  canMutate: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("ea");
  const [signerName, setSignerName] = useState(job?.siteContact?.name ?? "");
  const [signerTitle, setSignerTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const save = async () => {
    if (!organizationId || !job) return;
    if (!online) {
      setError("You’re offline. Reconnect to save.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (open === "update") {
        if (!body.trim()) throw new Error("Add a short work update.");
        await addWorkUpdate(organizationId, job.id, body.trim());
      }
      if (open === "material") {
        const qty = Number(quantity);
        if (!name.trim() || !Number.isFinite(qty) || qty <= 0) {
          throw new Error("Enter a material name and quantity.");
        }
        await addJobMaterial(organizationId, job.id, {
          name: name.trim(),
          quantity: qty,
          unit: unit.trim() || "ea",
        });
      }
      if (open === "signoff") {
        if (!signerName.trim() || padRef.current?.isEmpty()) {
          throw new Error("Add the signer name and a signature.");
        }
        await addJobSignature(organizationId, job.id, {
          signerName: signerName.trim(),
          signerTitle: signerTitle.trim() || undefined,
          imageBase64: padRef.current?.toPng() ?? "",
        });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (file: File) => {
    if (!organizationId || !job) return;
    if (!online) {
      setError("You’re offline. Reconnect to upload a photo.");
      return;
    }
    setSaving(true);
    setError(null);
    setPhotoProgress(0);
    try {
      await uploadJobFile(organizationId, job.id, file, {
        category: "PHOTO",
        onProgress: setPhotoProgress,
      });
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoProgress(null);
      await onSaved();
    } catch (err) {
      setPhotoProgress(null);
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDrawer
      open={open !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        open === "update"
          ? "Work update"
          : open === "photo"
            ? "Add photo"
            : open === "material"
              ? "Add material"
              : "Client sign-off"
      }
      description={job ? `${job.jobNumber} · ${job.title}` : undefined}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {open === "update" ? (
          <>
            <Label htmlFor="work-update">What did you do?</Label>
            <Textarea
              id="work-update"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              className="min-h-32"
            />
          </>
        ) : null}
        {open === "photo" ? (
          <div className="flex flex-col gap-3">
            <Label htmlFor="job-photo">Camera or library</Label>
            <Input
              id="job-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="h-12"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setPhotoFile(file);
                setPhotoPreview(URL.createObjectURL(file));
              }}
            />
            {photoPreview ? (
              <img src={photoPreview} alt="Selected photo" className="max-h-48 rounded-md object-contain" />
            ) : null}
            {photoProgress !== null ? (
              <p className="text-sm text-muted-foreground">Uploading {photoProgress}%</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                className="h-11 flex-1"
                disabled={!photoFile || saving || !canMutate || !online}
                onClick={() => photoFile && void onPhoto(photoFile)}
              >
                {saving ? "Uploading…" : "Upload"}
              </Button>
              {photoFile ? (
                <Button
                  className="h-11"
                  variant="outline"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreview(null);
                  }}
                >
                  Remove
                </Button>
              ) : null}
              {error && photoFile ? (
                <Button className="h-11" variant="outline" onClick={() => void onPhoto(photoFile)}>
                  Retry
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {open === "material" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="material-name">Material</Label>
              <Input
                id="material-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="material-qty">Quantity</Label>
                <Input
                  id="material-qty"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="material-unit">Unit</Label>
                <Input
                  id="material-unit"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  className="h-11"
                />
              </div>
            </div>
          </div>
        ) : null}
        {open === "signoff" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="signer-name">Signer name</Label>
              <Input
                id="signer-name"
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="signer-title">Title</Label>
              <Input
                id="signer-title"
                value={signerTitle}
                onChange={(event) => setSignerTitle(event.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Signature</Label>
              <SignaturePad ref={padRef} />
            </div>
          </div>
        ) : null}
        {open !== "photo" ? (
          <MutationButton
            className="h-12 w-full"
            disabled={!canMutate || !online || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </MutationButton>
        ) : null}
      </div>
    </ResponsiveDrawer>
  );
}

function ClockLocationLines({
  evidence,
}: {
  evidence: {
    locationStatus: "NEAR_SITE" | "LOCATION_REVIEW" | "NO_SITE_LOCATION" | "LOW_ACCURACY" | "NO_GPS";
    distanceFromSiteMeters: number | null;
    accuracyMeters: number | null;
  };
}) {
  const distance = formatDistanceFromSite(evidence.distanceFromSiteMeters);
  const accuracy = formatAccuracy(evidence.accuracyMeters);
  return (
    <div className="mt-1 text-sm text-muted-foreground">
      {evidence.locationStatus !== "NEAR_SITE" ? (
        <p>{locationStatusLabel(evidence.locationStatus)}</p>
      ) : null}
      {distance ? <p>{distance}</p> : null}
      {accuracy ? <p>{accuracy}</p> : null}
    </div>
  );
}

function formatShiftDate(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}
