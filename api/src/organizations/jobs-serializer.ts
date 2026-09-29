import { serializeOrganizationPerson, type OrganizationPerson } from './member-person.js';
import type {
  JobPriority,
  JobStatus,
} from '../generated/prisma/client.js';

export type JobPerson = ReturnType<typeof serializeOrganizationPerson>;

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
  supervisor: OrganizationPerson | null;
  assignments: Array<{ user: OrganizationPerson }>;
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
      ? serializeOrganizationPerson(job.supervisor, job.organizationId)
      : null,
    technicians: job.assignments.map((row) => serializeOrganizationPerson(row.user, job.organizationId)),
    updatedAt: job.updatedAt.toISOString(),
  };
}
