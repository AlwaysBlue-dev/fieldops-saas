import { Injectable, Logger } from '@nestjs/common';
import { JobStatus, OrganizationRole, type Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';

const include = {
  assignments: true,
  client: { select: { name: true } },
  site: { select: { name: true } },
} satisfies Prisma.JobInclude;
type Snapshot = Prisma.JobGetPayload<{ include: typeof include }>;
type Delivery = Parameters<MailService['sendJobWorkflow']>[0];

@Injectable()
export class JobNotificationHook {
  private readonly logger = new Logger(JobNotificationHook.name);
  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async snapshot(tx: Prisma.TransactionClient, organizationId: string, jobId: string, lock = false) {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${jobId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    }
    return tx.job.findFirstOrThrow({ where: { id: jobId, organizationId }, include });
  }

  /** Called inside the business transaction; only committed differences become events. */
  async changes(
    tx: Prisma.TransactionClient, ctx: OrganizationContext, actorUserId: string,
    before: Snapshot | null, after: Snapshot, reason?: string,
  ): Promise<Delivery[]> {
    const emails: Delivery[] = [];
    const technicians = [...new Set(after.assignments.map((row) => row.userId))];
    const supervisors = after.supervisorUserId ? [after.supervisorUserId] : [];
    const crew = [...new Set([...technicians, ...supervisors])];
    const label = `${after.jobNumber} · ${after.title}`;
    const actor = await tx.user.findUnique({ where: { id: actorUserId }, select: { fullName: true } });
    const context = `${after.client.name} · ${after.site.name}`;
    const scheduled = after.scheduledStart
      ? new Intl.DateTimeFormat('en-US', { timeZone: ctx.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(after.scheduledStart)
      : null;
    const finish = after.expectedFinish
      ? new Intl.DateTimeFormat('en-US', { timeZone: ctx.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(after.expectedFinish)
      : null;
    const windowLabel = `${scheduled}${finish ? ` – ${finish}` : ''}`;
    const emit = async (type: string, title: string, body: string, recipients: string[], emailRecipients: string[]) => {
      const members = await tx.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId, status: 'ACTIVE',
          userId: { in: [...new Set(recipients)], not: actorUserId },
          OR: [{ role: { not: OrganizationRole.TECHNICIAN } }, { userId: { in: technicians } }],
        },
        include: { user: { select: { email: true, fullName: true } } },
      });
      await this.notifications.notify({
        organizationId: ctx.organizationId, actorUserId, recipientUserIds: members.map((m) => m.userId),
        type, title, message: body, relatedEntityType: 'Job', relatedEntityId: after.id,
        payload: { jobId: after.id, jobNumber: after.jobNumber, orgSlug: ctx.slug },
      }, tx);
      for (const member of members) {
        if (emailRecipients.includes(member.userId)) emails.push({
          to: member.user.email, recipientName: member.user.fullName,
          organizationName: ctx.name, orgSlug: ctx.slug, jobId: after.id,
          title, message: body, review: type === 'JOB_APPROVAL_REQUESTED',
        });
      }
    };
    const previousTechnicians = new Set(before?.assignments.map((row) => row.userId) ?? []);
    const newTechnicians = technicians.filter((id) => !previousTechnicians.has(id) &&
      !(id === after.supervisorUserId && before?.supervisorUserId !== after.supervisorUserId));
    const draft = after.status === JobStatus.DRAFT ? ' The job is currently being prepared.' : '';
    const details = ` ${context}.${scheduled ? ` ${after.status === JobStatus.DRAFT ? 'Planned for' : 'Scheduled for'} ${windowLabel} (${ctx.timezone}).` : ''}`;
    if (newTechnicians.length) await emit('JOB_ASSIGNED', 'New job assigned',
      `You've been assigned to ${label}.${draft}${details}`, newTechnicians, newTechnicians);
    if (after.supervisorUserId && before?.supervisorUserId !== after.supervisorUserId) {
      await emit('JOB_SUPERVISOR_ASSIGNED', 'Job assigned for supervision',
        `You've been assigned as supervisor for ${label}.${draft}${details}`, supervisors, supervisors);
    }
    const scheduleChanged = before?.scheduledStart?.getTime() !== after.scheduledStart?.getTime() ||
      before?.expectedFinish?.getTime() !== after.expectedFinish?.getTime();
    const becameScheduled = before?.status === JobStatus.DRAFT && after.status === JobStatus.SCHEDULED;
    const rescheduled = before !== null && before.status !== JobStatus.DRAFT &&
      after.status !== JobStatus.DRAFT && scheduleChanged && Boolean(after.scheduledStart || before.scheduledStart);
    if (becameScheduled || rescheduled) {
      await emit(rescheduled ? 'JOB_RESCHEDULED' : 'JOB_SCHEDULED',
        rescheduled ? 'Job schedule changed' : 'Job scheduled',
        after.scheduledStart
          ? `${label} ${rescheduled ? 'has been rescheduled to' : 'is scheduled for'} ${windowLabel} (${ctx.timezone}). ${context}.`
          : `The schedule for ${label} was cleared. ${context}.`,
        crew, technicians);
    }
    if (before?.status !== after.status) {
      if (after.status === JobStatus.DISPATCHED) await emit('JOB_DISPATCHED', 'Job ready',
        `${label} has been dispatched and is ready for you.${details}`, crew, technicians);
      if (after.status === JobStatus.IN_PROGRESS && before?.status === JobStatus.DISPATCHED) {
        await emit('JOB_STARTED', 'Work started', `${actor?.fullName ?? 'A technician'} started work on ${label}.`, supervisors, []);
      }
      if (after.status === JobStatus.PENDING_APPROVAL) {
        // Unassigned reviews are handled by the existing organization-wide reviewer roles.
        const assignedReviewers = await tx.organizationMember.findMany({
          where: {
            organizationId: ctx.organizationId, status: 'ACTIVE',
            userId: { in: supervisors, notIn: [...technicians, actorUserId] },
            role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.OPERATIONS_MANAGER, OrganizationRole.SUPERVISOR] },
          },
          select: { userId: true },
        });
        const reviewers = assignedReviewers.length ? assignedReviewers.map((member) => member.userId) : (await tx.organizationMember.findMany({
          where: { organizationId: ctx.organizationId, status: 'ACTIVE',
            role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.OPERATIONS_MANAGER] },
            userId: { notIn: technicians } },
          select: { userId: true },
        })).map((member) => member.userId);
        await emit('JOB_APPROVAL_REQUESTED', 'Job ready for review',
          `${actor?.fullName ?? 'A technician'} submitted ${label} for approval.`, reviewers, reviewers);
      }
      if (after.status === JobStatus.RETURNED) await emit('JOB_RETURNED', 'Job returned for updates',
        `${label} was returned for updates.${reason ? ` Review comments: ${reason}` : ''}`, technicians, technicians);
      if (after.status === JobStatus.COMPLETED) await emit('JOB_APPROVED', 'Job approved',
        `${label} has been approved.`, technicians, []);
    }
    return emails;
  }

  /** Email is secondary delivery, after commit; failures cannot roll back job work. */
  async deliver(emails: Delivery[]) {
    for (const email of emails) {
      try { await this.mail.sendJobWorkflow(email); }
      catch { this.logger.error('Job email delivery failed'); }
    }
  }
}
