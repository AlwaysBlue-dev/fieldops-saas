import type { DocArticle } from "../types";

export const offlineFieldOperations: DocArticle = {
  slug: "offline-field-operations",
  title: "Work offline and sync later",
  description:
    "Prepare assigned jobs for offline use, save supported field updates on the device, and sync when connectivity returns.",
  categoryId: "my-day",
  keywords: [
    "offline",
    "sync",
    "PWA",
    "prepare for offline",
    "pending changes",
    "IndexedDB",
    "field",
    "My Day",
  ],
  relatedSlugs: [
    "my-day",
    "install-fieldkeel-on-phone",
    "job-execution",
    "time-gps",
    "sites-access-notes",
  ],
  sections: [
    {
      id: "prepare",
      heading: "Prepare assigned jobs for offline use",
      paragraphs: [
        "On My Day, use Prepare for offline while you still have coverage. FieldKeel downloads the assigned jobs on your board (current and upcoming) that you are authorized to open — not the whole organization catalog.",
        "Each prepared snapshot includes job details, site address and access notes, site and on-site contact information where available, checklists and safety context from the job card, and the server’s Missing access info status at download time.",
        "The offline bar shows how many jobs are saved on this device and the latest sync status. Prepare again before you leave coverage if assignments changed.",
      ],
    },
    {
      id: "local-saves",
      heading: "What you can save offline",
      paragraphs: [
        "While offline, technicians can record supported My Day actions against prepared work: clock in/out events, work updates, materials, photos, and client sign-off signatures. Changes are stored on the device immediately and marked as waiting to sync — not as server-confirmed.",
        "Photos and signatures stay on the device until the server accepts the upload. FieldKeel does not show a file as uploaded merely because it was selected or saved locally.",
        "Dispatch, supervisor approval, billing, membership changes, and other administrative transitions still require a connection. If you attempt an online-only action offline, FieldKeel explains that a connection is required and keeps related drafts where applicable.",
      ],
    },
    {
      id: "sync",
      heading: "Synchronization",
      paragraphs: [
        "Use Sync now when you are back online, or wait for FieldKeel to retry when connectivity returns and when you reopen or resume the app. Queued operations run in order with stable identifiers so retries do not create duplicate clock events or notes.",
        "The offline bar reports waiting, failed, and conflict counts. Failed items stay visible for retry. Conflicts (for example a clock rule rejection) keep your local record and explain the problem instead of silently inventing a server session.",
        "The server remains authoritative. Local timestamps and GPS are evidence for validation; FieldKeel does not fabricate server verification results.",
      ],
    },
    {
      id: "limits",
      heading: "Important limits",
      paragraphs: [
        "Browser storage can be cleared by the device or browser. Treat offline copies as convenience snapshots, not the source of truth. Sign-out clears this account’s offline jobs, queue, and local file blobs on the device.",
        "Access notes and contacts in an offline job reflect the last successful download. A Missing access info warning shown offline is last-synced information — reconnect to refresh the server-calculated status before relying on it for dispatch decisions.",
        "Installing FieldKeel as an app helps with an app-like shell, but you still need to prepare jobs while online for offline field work.",
      ],
    },
  ],
};
