"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { MobileList, MobileListItem } from "@/components/fieldops/mobile-list";
import { StatusPill } from "@/components/fieldops/status-pill";
import {
  priorityTone,
  statusLabel,
  statusTone,
  type ScheduleBoard,
  type ScheduleJob,
} from "@/lib/schedule";
import {
  addCalendarDays,
  formatDateTimeInZone,
  formatYmdInZone,
} from "@/lib/timezone";

export function ScheduleAgenda({
  board,
  onOpenJob,
}: {
  board: ScheduleBoard;
  onOpenJob: (job: ScheduleJob) => void;
}) {
  const today = board.date;
  const tomorrow = addCalendarDays(today, 1);
  const jobs = uniqueJobs([
    ...board.lanes.flatMap((lane) => lane.jobs),
    ...board.unassigned,
  ]);
  const groups = [
    {
      title: "Today",
      items: jobs.filter((job) => dayOf(job, board.timezone) === today),
    },
    {
      title: "Tomorrow",
      items: jobs.filter((job) => dayOf(job, board.timezone) === tomorrow),
    },
    {
      title: "This week",
      items: jobs.filter((job) => {
        const day = dayOf(job, board.timezone);
        return day !== today && day !== tomorrow && day >= board.date;
      }),
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:hidden">
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="mb-2 text-sm font-semibold">{group.title}</h2>
          <MobileList
            empty={
              <EmptyState
                title={`No jobs ${group.title.toLowerCase()}`}
                description="Assigned visits for this window will appear here."
              />
            }
          >
            {group.items.map((job) => (
              <button
                key={job.id}
                type="button"
                className="w-full text-left"
                onClick={() => onOpenJob(job)}
              >
                <MobileListItem
                  title={`${job.jobNumber} · ${job.client.name}`}
                  meta={`${job.site.name} · ${formatDateTimeInZone(job.scheduledStart, board.timezone)}`}
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <StatusPill label={job.priority} tone={priorityTone(job.priority)} />
                      <StatusPill
                        label={statusLabel(job.status)}
                        tone={statusTone(job.status)}
                      />
                    </div>
                  }
                />
              </button>
            ))}
          </MobileList>
        </section>
      ))}
    </div>
  );
}

function dayOf(job: ScheduleJob, timezone: string) {
  return job.scheduledStart
    ? formatYmdInZone(new Date(job.scheduledStart), timezone)
    : "";
}

function uniqueJobs(jobs: ScheduleJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}
