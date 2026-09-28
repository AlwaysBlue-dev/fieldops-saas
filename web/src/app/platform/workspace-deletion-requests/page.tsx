"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listWorkspaceDeletions, reviewWorkspaceDeletion, type PlatformDeletionRequest } from "@/lib/workspace-deletion";

export default function WorkspaceDeletionRequestsPage() {
  const [items, setItems] = useState<PlatformDeletionRequest[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ request: PlatformDeletionRequest; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await listWorkspaceDeletions(page);
    setItems(result.items);
    setTotal(result.total);
  }, [page]);
  useEffect(() => {
    let cancelled = false;
    listWorkspaceDeletions(page).then((result) => {
      if (!cancelled) { setItems(result.items); setTotal(result.total); setError(null); }
    }).catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load requests."); });
    return () => { cancelled = true; };
  }, [page]);

  async function review() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await reviewWorkspaceDeletion(selected.request.id, selected.decision, note);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review request.");
      setSelected(null);
      await load().catch(() => undefined);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Workspace Deletion Requests</h1>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button variant="outline" disabled={busy} onClick={() => void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load requests."))}>Refresh</Button>
      {items.length === 0 && !error ? <p className="text-sm text-muted-foreground">No deletion requests on this page.</p> : null}
      {items.map((request) => (
        <section key={request.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="break-words font-semibold">{request.workspaceName}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Requested by Owner</dt><dd className="break-all">{request.requestedBy.fullName} · {request.requestedBy.email}</dd></div>
            <div><dt className="text-muted-foreground">Requested</dt><dd>{new Date(request.requestedAt).toLocaleString()}</dd></div>
            <div><dt className="text-muted-foreground">Current subscription state</dt><dd>{request.effectiveStatus}</dd></div>
            <div><dt className="text-muted-foreground">Previously activated</dt><dd>{request.everActivated ? "Yes" : "No"}</dd></div>
            <div><dt className="text-muted-foreground">Request status</dt><dd>{request.status}{request.organization.deletedAt ? " · Workspace deleted" : ""}</dd></div>
          </dl>
          {request.note ? <p className="break-words text-sm">{request.note}</p> : null}
          {request.status === "PENDING" ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={() => { setNote(""); setSelected({ request, decision: "APPROVED" }); }}>Approve Deletion</Button>
              <Button variant="outline" onClick={() => { setNote(""); setSelected({ request, decision: "REJECTED" }); }}>Reject Request</Button>
            </div>
          ) : null}
        </section>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-sm">Page {page}</span>
        <Button variant="outline" disabled={page * 25 >= total || busy} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.decision === "APPROVED" ? "Approve deletion" : "Reject deletion request"} of {selected?.request.workspaceName}?</DialogTitle>
            <DialogDescription>
              {selected?.decision === "APPROVED"
                ? "Approval removes access for every member. This cannot be undone in FieldKeel. Billing, audit, workspace records and stored files are retained, not physically erased."
                : "The workspace will remain unchanged. The Owner will receive the decision in their Inbox."}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm">Optional review note
            <textarea placeholder="Explain the deletion review decision" maxLength={2000} className="min-h-24 w-full rounded-md border border-input bg-background p-2" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button>
            <Button variant={selected?.decision === "APPROVED" ? "destructive" : "default"} disabled={busy} onClick={() => void review()}>
              {busy ? "Saving…" : selected?.decision === "APPROVED" ? "Approve Deletion" : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
