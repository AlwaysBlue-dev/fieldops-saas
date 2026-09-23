import type {
  JobPriority,
  JobStatus,
} from '../generated/prisma/client.js';

export type JobPerson = { userId: string; fullName: string };

export type JobSummaryView = {
  id: string;
  organizationId: string;
  jobNumber: string;
  title: string;
  jobType: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: string | null;
  expectedFinish: string | null;
  workOrderNumber: string | null;
  client: { id: string; name: string };
  site: { id: string; name: string; city?: string | null };
  team: { id: string; name: string } | null;
  supervisor: JobPerson | null;
  technicians: JobPerson[];
  updatedAt: string;
};

export function serializeJobSummary(job: {
  id: string;
  organizationId: string;
  jobNumber: string;
  title: string;
  jobType: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: Date | null;
  expectedFinish: Date | null;
  workOrderNumber: string | null;
  updatedAt: Date;
  client: { id: string; name: string };
  site: { id: string; name: string; city?: string | null };
  team: { id: string; name: string } | null;
  supervisor: { id: string; fullName: string } | null;
  assignments: Array<{ user: { id: string; fullName: string } }>;
}): JobSummaryView {
  return {
    id: job.id,
    organizationId: job.organizationId,
    jobNumber: job.jobNumber,
    title: job.title,
    jobType: job.jobType,
    status: job.status,
    priority: job.priority,
    scheduledStart: job.scheduledStart?.toISOString() ?? null,
    expectedFinish: job.expectedFinish?.toISOString() ?? null,
    workOrderNumber: job.workOrderNumber,
    client: job.client,
    site: { id: job.site.id, name: job.site.name, city: job.site.city ?? null },
    team: job.team,
    supervisor: job.supervisor
      ? { userId: job.supervisor.id, fullName: job.supervisor.fullName }
      : null,
    technicians: job.assignments.map((row) => ({
      userId: row.user.id,
      fullName: row.user.fullName,
    })),
    updatedAt: job.updatedAt.toISOString(),
  };
}
