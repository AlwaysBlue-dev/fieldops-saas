"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { JobDetail } from "@/lib/jobs";
import { getOrganization } from "@/lib/organizations";
import { listTeams, type TeamSummary } from "@/lib/teams";
import { MutationButton } from "./mutation-control";
import { ScheduleJobSheet } from "./schedule-job-sheet";

export function JobScheduleAction({ job, organizationId, pending, onSaved }: {
  job: JobDetail; organizationId: string; pending: boolean; onSaved: () => void;
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  return <>
    <MutationButton variant="outline" className="h-11 w-full md:h-8" disabled={pending || loading} onClick={async () => {
      setLoading(true); setError(null);
      try {
        const org = await getOrganization(organizationId);
        const items: TeamSummary[] = [];
        let page = 1;
        while (true) {
          const result = await listTeams(organizationId, { status: "ACTIVE", pageSize: 100, page });
          items.push(...result.items);
          if (items.length >= result.total || result.items.length === 0) break;
          page++;
        }
        setTimezone(org.timezone); setTeams(items); setOpen(true);
      } catch (error) { setError(error instanceof Error ? error.message : "Could not load scheduling options."); }
      finally { setLoading(false); }
    }}>{job.status === "DRAFT" ? "Schedule / assign" : "Edit schedule / assignment"}</MutationButton>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <ScheduleJobSheet open={open} onOpenChange={setOpen} organizationId={organizationId} orgSlug={orgSlug} timezone={timezone} job={job} teams={teams} canEdit={job.permissions.canEdit} onSaved={onSaved} />
  </>;
}
