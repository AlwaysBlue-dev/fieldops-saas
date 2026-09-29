import { serializeOrganizationPerson, type OrganizationPerson } from './member-person.js';
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
  supervisor: ReturnType<typeof serializeOrganizationPerson> | null;
  technicians: Array<ReturnType<typeof serializeOrganizationPerson>>;
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
  supervisor: OrganizationPerson | null;
  assignments: Array<{ user: OrganizationPerson }>;
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
      ? serializeOrganizationPerson(job.supervisor, job.organizationId)
      : null,
    technicians: job.assignments.map((row) => serializeOrganizationPerson(row.user, job.organizationId)),
  };
}
