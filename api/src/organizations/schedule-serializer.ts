import { serializeOrganizationPerson, type OrganizationPerson } from './member-person.js';
import type {
  JobPriority,
  JobStatus,
} from '../generated/prisma/client.js';
import {
  accessInfoFromJobRow,
  type JobAccessInfo,
} from './job-access-info.js';

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
  missingAccessInfo: boolean;
  accessInfoReady: boolean;
  missingAccessItems: JobAccessInfo['missingItems'];
};

type ScheduleJobRow = {
  id: string;
  organizationId: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: Date | null;
  expectedFinish: Date | null;
  clientRepName?: string | null;
  clientRepPhone?: string | null;
  client: { id: string; name: string };
  site: {
    id: string;
    name: string;
    notes?: string | null;
    accessNotes?: string | null;
    siteContactName?: string | null;
    siteContactPhone?: string | null;
    contacts?: Array<{ name: string | null; phone: string | null }>;
  };
  team: { id: string; name: string } | null;
  supervisor: OrganizationPerson | null;
  assignments: Array<{ user: OrganizationPerson }>;
};

export function serializeScheduleJob(job: ScheduleJobRow): ScheduleJobView {
  const access = accessInfoFromJobRow(job);
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
    site: { id: job.site.id, name: job.site.name },
    team: job.team,
    supervisor: job.supervisor
      ? serializeOrganizationPerson(job.supervisor, job.organizationId)
      : null,
    technicians: job.assignments.map((row) =>
      serializeOrganizationPerson(row.user, job.organizationId),
    ),
    missingAccessInfo: access.missingAccessInfo,
    accessInfoReady: access.accessInfoReady,
    missingAccessItems: access.missingItems,
  };
}
