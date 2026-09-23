"use client";

import { StatusPill } from "@/components/fieldops/status-pill";
import { cn } from "cn";
import type { DragEvent } from "react";
import {
  jobDurationMs,
  priorityTone,
  statusLabel,
  statusTone,
  type ScheduleBoard,
  type ScheduleJob,
  type ScheduleLane,
} from "@/lib/schedule";
import {
  addCalendarDays,
  formatTimeInZone,
  formatYmdInZone,
  getZonedParts,
  zonedLocalToUtc,
} from "@/lib/timezone";

const DAY_START = 6;
const DAY_HOURS = 14;

function blockStyle(job: ScheduleJob, timezone: string) {
  if (!job.scheduledStart) return { left: "0%", width: "8%" };
  const start = getZonedParts(new Date(job.scheduledStart), timezone);
  const minutes = start.hour * 60 + start.minute - DAY_START * 60;
  const duration = jobDurationMs(job) / 60_000;
  const left = Math.min(100, Math.max(0, (minutes / (DAY_HOURS * 60)) * 100));
  const width = Math.min(100 - left, Math.max(6, (duration / (DAY_HOURS * 60)) * 100));
  return { left: `${left}%`, width: `${width}%` };
}

function JobChip({
  job,
  timezone,
  compact,
  canDrag,
  onOpen,
}: {
  job: ScheduleJob;
  timezone: string;
  compact?: boolean;
  canDrag: boolean;
  onOpen: (job: ScheduleJob) => void;
}) {
  return (
    <button
      type="button"
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag) return;
        event.dataTransfer.setData("text/job-id", job.id);
        event.dataTransfer.setData("text/duration", String(jobDurationMs(job)));
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(job)}
      className={cn(
        "w-full rounded-md border border-border bg-card px-2 py-1.5 text-left shadow-xs hover:bg-muted/50",
        compact && "px-1.5 py-1",
      )}
    >
      <p className="truncate text-xs font-semibold">
        {job.jobNumber} · {job.client.name}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{job.site.name}</p>
      <p className="truncate text-[11px]">
        {formatTimeInZone(job.scheduledStart, timezone)}
        {job.expectedFinish ? `–${formatTimeInZone(job.expectedFinish, timezone)}` : ""}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <StatusPill label={job.priority} tone={priorityTone(job.priority)} />
        <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
      </div>
    </button>
  );
}

export function ScheduleBoard({
  board,
  canEdit,
  onOpenJob,
  onDropSchedule,
}: {
  board: ScheduleBoard;
  canEdit: boolean;
  onOpenJob: (job: ScheduleJob) => void;
  onDropSchedule: (input: {
    jobId: string;
    scheduledStart: string;
    expectedFinish: string;
    technicianUserIds?: string[];
    teamId?: string | null;
  }) => void;
}) {
  const hours = Array.from({ length: DAY_HOURS }, (_, index) => DAY_START + index);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(mondayOf(board), index),
  );
  const lanes = board.lanes.filter(
    (lane) => lane.kind !== "TEAM" || lane.jobs.length > 0,
  );

  function dropOnDayLane(
    event: DragEvent<HTMLDivElement>,
    lane: ScheduleLane,
  ) {
    event.preventDefault();
    const jobId = event.dataTransfer.getData("text/job-id");
    const duration = Number(event.dataTransfer.getData("text/duration") || 120 * 60_000);
    if (!jobId || !canEdit) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const minutes = Math.round((DAY_START * 60 + ratio * DAY_HOURS * 60) / 15) * 15;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const start = zonedLocalToUtc(
      board.date,
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      board.timezone,
    );
    const finish = new Date(start.getTime() + duration);
    onDropSchedule({
      jobId,
      scheduledStart: start.toISOString(),
      expectedFinish: finish.toISOString(),
      technicianUserIds: lane.userId ? [lane.userId] : [],
      teamId: lane.teamId,
    });
  }

  if (board.range === "week") {
    return (
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <table className="min-w-[880px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 w-40 bg-card px-3 py-2 text-left font-medium">
                Resource
              </th>
              {weekDays.map((day) => (
                <th key={day} className="px-2 py-2 text-left font-medium">
                  {formatWeekday(day, board.timezone)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane) => (
              <tr key={lane.id} className="border-b border-border align-top">
                <th className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                  {lane.label}
                  <p className="text-[11px] font-normal text-muted-foreground">
                    {lane.kind === "TEAM" ? "Team" : "Technician"}
                  </p>
                </th>
                {weekDays.map((day) => (
                  <td
                    key={`${lane.id}-${day}`}
                    className="min-w-[110px] px-1 py-1"
                    onDragOver={(event) => canEdit && event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const jobId = event.dataTransfer.getData("text/job-id");
                      const duration = Number(
                        event.dataTransfer.getData("text/duration") || 120 * 60_000,
                      );
                      if (!jobId || !canEdit) return;
                      const existing = lane.jobs.find((item) => item.id === jobId);
                      const time = existing?.scheduledStart
                        ? getZonedParts(new Date(existing.scheduledStart), board.timezone)
                        : { hour: 8, minute: 0 };
                      const start = zonedLocalToUtc(
                        day,
                        `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00`,
                        board.timezone,
                      );
                      onDropSchedule({
                        jobId,
                        scheduledStart: start.toISOString(),
                        expectedFinish: new Date(start.getTime() + duration).toISOString(),
                        technicianUserIds: lane.userId ? [lane.userId] : [],
                        teamId: lane.teamId,
                      });
                    }}
                  >
                    <div className="flex min-h-16 flex-col gap-1">
                      {lane.jobs
                        .filter((job) =>
                          job.scheduledStart
                            ? formatYmdInZone(new Date(job.scheduledStart), board.timezone) === day
                            : false,
                        )
                        .map((job) => (
                          <JobChip
                            key={job.id}
                            job={job}
                            timezone={board.timezone}
                            compact
                            canDrag={canEdit}
                            onOpen={onOpenJob}
                          />
                        ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
      <div className="min-w-[960px]">
        <div className="grid grid-cols-[11rem_1fr] border-b border-border">
          <div className="px-3 py-2 text-sm font-medium">Resource</div>
          <div className="grid grid-cols-[repeat(14,minmax(0,1fr))]">
            {hours.map((hour) => (
              <div key={hour} className="px-1 py-2 text-[11px] text-muted-foreground">
                {formatHour(hour)}
              </div>
            ))}
          </div>
        </div>
        {lanes.map((lane) => (
          <div key={lane.id} className="grid grid-cols-[11rem_1fr] border-b border-border last:border-b-0">
            <div className="px-3 py-3">
              <p className="text-sm font-medium">{lane.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {lane.kind === "TEAM" ? "Team lane" : "Technician"}
              </p>
            </div>
            <div
              className="relative min-h-[5.5rem] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] bg-[length:calc(100%/14)_100%]"
              onDragOver={(event) => canEdit && event.preventDefault()}
              onDrop={(event) => dropOnDayLane(event, lane)}
            >
              {lane.jobs.map((job) => (
                <div
                  key={job.id}
                  className="absolute top-2 bottom-2 px-0.5"
                  style={blockStyle(job, board.timezone)}
                >
                  <JobChip
                    job={job}
                    timezone={board.timezone}
                    canDrag={canEdit}
                    onOpen={onOpenJob}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function mondayOf(board: ScheduleBoard) {
  return formatYmdInZone(new Date(board.from), board.timezone);
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const value = hour % 12 === 0 ? 12 : hour % 12;
  return `${value}${suffix}`;
}

function formatWeekday(ymd: string, timeZone: string) {
  const noon = zonedLocalToUtc(ymd, "12:00:00", timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(noon);
}
