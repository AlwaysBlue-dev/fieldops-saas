"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelWorkspaceDeletion, deleteWorkspace, getWorkspaceDeletion, requestWorkspaceDeletion, type DeletionStatus } from "@/lib/workspace-deletion";
import { clearPreferredOrgSlug } from "@/lib/workspace-home";

export function WorkspaceDangerZone({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<DeletionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const next = await getWorkspaceDeletion(organizationId);
    setState(next);
  }, [organizationId]);
  useEffect(() => {
    let cancelled = false;
    getWorkspaceDeletion(organizationId)
      .then((next) => { if (!cancelled) setState(next); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load deletion status."); });
    return () => { cancelled = true; };
  }, [organizationId]);

  async function submit(cancel = false) {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      if (cancel) await cancelWorkspaceDeletion(organizationId);
      else if (state.everActivated) await requestWorkspaceDeletion(organizationId);
      else {
        await deleteWorkspace(organizationId);
        clearPreferredOrgSlug(state.organization.slug);
        window.location.assign("/app");
        return;
      }
      await load();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update workspace deletion.");
      // Eligibility may have changed since the dialog opened.
      await load().catch(() => undefined);
      setOpen(false);
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-6 rounded-lg border border-destructive/40 bg-card p-4">
      <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Delete workspace access for everyone. Retained billing, audit, and workspace data are not physically erased.
      </p>
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {!state ? <Button variant="outline" className="mt-3" onClick={() => { void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load status.")); }}>Reload deletion status</Button> : (
        <>
          <Button variant="ghost" className="mt-2" disabled={busy} onClick={() => {
            setError(null);
            void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load status."));
          }}>Refresh status</Button>
          {state.request?.status === "PENDING" ? (
            <div className="mt-3 space-y-3">
              <p className="font-medium">Deletion request pending</p>
              <p className="text-sm text-muted-foreground">Your request has been sent to FieldKeel for review. Your workspace will not be deleted unless the request is approved.</p>
              <Button variant="outline" disabled={busy} onClick={() => void submit(true)}>Cancel Deletion Request</Button>
            </div>
          ) : (
            <>
              {state.request ? <p className="mt-3 text-sm" role="status">
                {state.request.status === "REJECTED" ? "Workspace deletion request was not approved." : "Deletion request cancelled."}
                {state.request.note ? ` ${state.request.note}` : ""}
              </p> : null}
              <Button variant="destructive" className="mt-3" disabled={busy} onClick={() => setOpen(true)}>Delete Workspace</Button>
            </>
          )}
          <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete workspace?</DialogTitle>
                <DialogDescription>
                  {state.everActivated
                    ? "This workspace has previously been activated. For account and billing protection, a deletion request must be reviewed by FieldKeel."
                    : `Delete access to ${state.organization.name} for all members? This cannot be undone in FieldKeel. Billing, audit, and workspace records will be retained; this does not erase stored files.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="destructive" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Saving…" : state.everActivated ? "Request Workspace Deletion" : "Delete Workspace"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}
