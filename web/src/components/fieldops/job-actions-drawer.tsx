"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getJobCard, type JobDetail } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { PrimaryActions } from "./job-detail-workspace";
import { ResponsiveDrawer } from "./responsive-drawer";
import { useDataRefresh, useRefreshLoader } from "./data-refresh-provider";

export function JobActionsDrawer({ jobId, organizationId, orgSlug, onClose, onChanged }: {
  jobId: string | null; organizationId: string; orgSlug: string; onClose: () => void; onChanged: () => Promise<unknown>;
}) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useDataRefresh();
  const load = useCallback(async () => {
    if (jobId) setJob(await getJobCard(organizationId, jobId));
  }, [organizationId, jobId]);
  useRefreshLoader(load);
  useEffect(() => {
    setJob(null); setError(null);
    let cancelled = false;
    if (jobId) getJobCard(organizationId, jobId).then((job) => { if (!cancelled) setJob(job); })
      .catch((error) => { if (!cancelled) setError(error instanceof Error ? error.message : "Could not load actions."); });
    return () => { cancelled = true; };
  }, [organizationId, jobId]);
  async function run(action: () => Promise<unknown>) {
    setPending(true); setError(null);
    try {
      await action();
      await load();
      await onChanged();
      await refresh?.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update job."); await load().catch(() => undefined); }
    finally { setPending(false); }
  }
  return <ResponsiveDrawer open={Boolean(jobId)} onOpenChange={(open) => { if (!open && !pending) onClose(); }} title={job ? `${job.jobNumber} · Actions` : "Job actions"}>
    {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
    {job ? <div className="space-y-3">
      <Button asChild variant="outline" className="w-full"><Link href={`/app/${orgSlug}/jobs/${job.id}`}>Open job</Link></Button>
      <PrimaryActions job={job} organizationId={organizationId} pending={pending} onAction={(action) => void run(action)} />
    </div> : !error ? <p>Loading current actions…</p> : null}
  </ResponsiveDrawer>;
}
