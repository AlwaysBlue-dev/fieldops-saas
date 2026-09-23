import type {
  JobPriority,
  JobStatus,
} from '../generated/prisma/client.js';

export type ScheduleJobView = {
  id: string;
  organizationId: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: string | null;
  expectedFinish: string | null;
  client: { id: string; name: string };
  site: { id: string; name: string };
  team: { id: string; name: string } | null;
  supervisor: { userId: string; fullName: string } | null;
  technicians: Array<{ userId: string; fullName: string }>;
};

export function serializeScheduleJob(job: {
  id: string;
  organizationId: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: Date | null;
  expectedFinish: Date | null;
  client: { id: string; name: string };
  site: { id: string; name: string };
  team: { id: string; name: string } | null;
  supervisor: { id: string; fullName: string } | null;
  assignments: Array<{ user: { id: string; fullName: string } }>;
}): ScheduleJobView {
  return {
    id: job.id,
    organizationId: job.organizationId,
    jobNumber: job.jobNumber,
    title: job.title,
    status: job.status,
    priority: job.priority,
    scheduledStart: job.scheduledStart?.toISOString() ?? null,
    expectedFinish: job.expectedFinish?.toISOString() ?? null,
    client: job.client,
    site: job.site,
    team: job.team,
    supervisor: job.supervisor
      ? { userId: job.supervisor.id, fullName: job.supervisor.fullName }
      : null,
    technicians: job.assignments.map((assignment) => ({
      userId: assignment.user.id,
      fullName: assignment.user.fullName,
    })),
  };
}
