"use client";

/* Evidence previews use authorized blob or short-lived URLs, not Next image hosts. */
/* eslint-disable @next/next/no-img-element */

import { SignaturePad, type SignaturePadHandle } from "@/components/fieldops/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  addJobSignOff,
  authorizedObjectUrl,
  deleteJobFile,
  listJobFiles,
  uploadJobFile,
  type JobFileRecord,
} from "@/lib/job-files";
import type { JobDetail } from "@/lib/jobs";
import { formatDateTimeInZone } from "@/lib/timezone";
import { useEffect, useRef, useState } from "react";

export function JobFilesPanel({
  organizationId,
  job,
  timezone,
  userId,
  canEdit,
  onChanged,
}: {
  organizationId: string;
  job: JobDetail;
  timezone: string;
  userId: string | null;
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [files, setFiles] = useState<JobFileRecord[]>(job.files);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const padRef = useRef<SignaturePadHandle>(null);
  const [signerName, setSignerName] = useState(job.clientRepName ?? "");
  const [signerRole, setSignerRole] = useState(job.clientRepTitle ?? "");
  const [comments, setComments] = useState(job.clientComments ?? "");

  useEffect(() => {
    let cancelled = false;
    listJobFiles(organizationId, job.id).then((rows) => {
      if (!cancelled) setFiles(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, job.id, job.updatedAt]);

  useEffect(() => {
    const revoked: string[] = [];
    let cancelled = false;
    Promise.all(
      files
        .filter((row) => row.mimeType.startsWith("image/"))
        .map(async (row) => {
          const url = await authorizedObjectUrl(row);
          return url ? ([row.id, url] as const) : null;
        }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const pair of pairs) {
        if (!pair) continue;
        next[pair[0]] = pair[1];
        if (pair[1].startsWith("blob:")) revoked.push(pair[1]);
      }
      setPreviews(next);
    });
    return () => {
      cancelled = true;
      revoked.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const photos = files.filter((row) => row.type === "PHOTO");
  const documents = files.filter((row) => row.type === "DOCUMENT" || row.type === "OTHER");
  const signatures = files.filter((row) => row.type === "SIGNATURE");
  const locked = Boolean(job.execution?.recordsLocked);

  async function upload(category: "PHOTO" | "DOCUMENT", file: File) {
    setError(null);
    setProgress(0);
    try {
      await uploadJobFile(organizationId, job.id, file, {
        category,
        caption: caption.trim() || undefined,
        onProgress: setProgress,
      });
      setPendingFile(null);
      setPreviewUrl(null);
      setCaption("");
      setProgress(null);
      await onChanged();
      setFiles(await listJobFiles(organizationId, job.id));
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <section className="space-y-4">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Photos</h2>
          {canEdit && !locked ? (
            <label className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              Add Photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setPendingFile(file);
                  setPreviewUrl(URL.createObjectURL(file));
                }}
              />
            </label>
          ) : null}
        </div>
        {pendingFile && previewUrl ? (
          <div className="mt-3 space-y-3">
            {/* Authorized blob/presigned URLs are not served by Next image optimization. */}
            <img src={previewUrl} alt="Selected photo" className="max-h-56 rounded-md object-contain" />
            <Input
              className="h-11"
              placeholder="Caption (optional)"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
            {progress !== null ? (
              <p className="text-sm text-muted-foreground">Uploading {progress}%</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button className="h-11" onClick={() => void upload("PHOTO", pendingFile)}>
                {progress !== null ? "Uploading…" : "Upload"}
              </Button>
              <Button
                className="h-11"
                variant="outline"
                onClick={() => {
                  setPendingFile(null);
                  setPreviewUrl(null);
                }}
              >
                Remove
              </Button>
              {error ? (
                <Button className="h-11" variant="outline" onClick={() => void upload("PHOTO", pendingFile)}>
                  Retry
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {photos.length === 0 && !pendingFile ? (
          <p className="mt-3 text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {photos.map((row) => (
              <li key={row.id} className="space-y-2">
                {previews[row.id] ? (
                  <a href={previews[row.id]} target="_blank" rel="noreferrer">
                    <img
                      src={previews[row.id]}
                      alt={row.caption || row.originalName}
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  </a>
                ) : (
                  <div className="aspect-square rounded-md bg-muted" />
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {row.caption || row.originalName}
                </p>
                {canEdit && !locked && row.uploadedById === userId ? (
                  <Button
                    className="h-10 w-full"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await deleteJobFile(organizationId, job.id, row.id);
                        await onChanged();
                        setFiles(await listJobFiles(organizationId, job.id));
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : "Could not delete.");
                      }
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Documents</h2>
          {canEdit && !locked ? (
            <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-input px-3 text-sm">
              Add document
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload("DOCUMENT", file);
                }}
              />
            </label>
          ) : null}
        </div>
        {documents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {documents.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-left text-primary"
                  onClick={async () => {
                    const access = files.find((item) => item.id === row.id);
                    const url = access ? await authorizedObjectUrl(access) : null;
                    if (url) window.open(url, "_blank", "noopener");
                  }}
                >
                  {row.originalName}
                </button>
                {canEdit && !locked && row.uploadedById === userId ? (
                  <Button
                    className="h-10"
                    variant="outline"
                    onClick={() =>
                      void deleteJobFile(organizationId, job.id, row.id).then(async () => {
                        await onChanged();
                        setFiles(await listJobFiles(organizationId, job.id));
                      })
                    }
                  >
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Signature</h2>
        {job.signatures[0] || signatures[0] ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              {job.signatures[0]?.representativeName ?? job.signatures[0]?.signerName} signed{" "}
              {job.signedAt
                ? formatDateTimeInZone(job.signedAt, timezone)
                : ""}
            </p>
            {previews[signatures[0]?.id ?? ""] ? (
              <img
                src={previews[signatures[0].id]}
                alt="Client signature"
                className="max-h-40 rounded-md border border-border bg-white"
              />
            ) : null}
          </div>
        ) : canEdit && !locked ? (
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="rep-name">Representative name</Label>
              <Input
                id="rep-name"
                className="mt-1 h-11"
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="rep-role">Role</Label>
              <Input
                id="rep-role"
                className="mt-1 h-11"
                value={signerRole}
                onChange={(event) => setSignerRole(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="rep-comments">Comments</Label>
              <Textarea
                id="rep-comments"
                className="mt-1"
                value={comments}
                onChange={(event) => setComments(event.target.value)}
              />
            </div>
            <SignaturePad ref={padRef} />
            <Button
              className="h-11 w-full"
              onClick={async () => {
                if (!signerName.trim() || padRef.current?.isEmpty()) {
                  setError("Add the representative name and a signature.");
                  return;
                }
                try {
                  await addJobSignOff(organizationId, job.id, {
                    representativeName: signerName.trim(),
                    representativeRole: signerRole.trim() || undefined,
                    clientAccepted: true,
                    clientComments: comments.trim() || undefined,
                    imageBase64: padRef.current?.toPng() ?? "",
                  });
                  await onChanged();
                  setFiles(await listJobFiles(organizationId, job.id));
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Could not save signature.");
                }
              }}
            >
              Save signature
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No client signature yet.</p>
        )}
      </div>
    </section>
  );
}
