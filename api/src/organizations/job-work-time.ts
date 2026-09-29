import { ClockSessionStatus, OrganizationRole, TimeEntrySource, TimeEntryStatus, type Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';

/** Shared by the submission checklist and the transactional submission gate. */
export async function workTimeBlockers(
  db: PrismaService | Prisma.TransactionClient,
  ctx: OrganizationContext, actorUserId: string, jobId: string,
): Promise<Array<{ code: string; message: string }>> {
  const sessions = await db.clockSession.findMany({
    where: { organizationId: ctx.organizationId, jobId },
    select: { technicianUserId: true, status: true, clockInAt: true, clockOutAt: true },
  });
  const blockers: Array<{ code: string; message: string }> = [];
  const open = sessions.filter((session) => session.status === ClockSessionStatus.OPEN);
  if (open.length) blockers.push({
    code: 'CLOCK',
    message: open.some((session) => session.technicianUserId === actorUserId)
      ? 'You are still clocked in to this job. Clock out before submitting for approval.'
      : 'All technicians must clock out before this job can be submitted for approval.',
  });
  const subject = ctx.role === OrganizationRole.TECHNICIAN ? actorUserId : undefined;
  const closed = sessions.some((session) => (!subject || session.technicianUserId === subject) &&
    session.status === ClockSessionStatus.CLOSED && session.clockOutAt !== null &&
    session.clockOutAt.getTime() > session.clockInAt.getTime());
  // Approved manual corrections provide work evidence without fabricating clock records.
  const corrected = !closed && await db.timeEntry.findFirst({
    where: { organizationId: ctx.organizationId, jobId, userId: subject,
      source: TimeEntrySource.MANUAL, status: TimeEntryStatus.APPROVED,
      endedAt: { not: null }, durationMinutes: { gt: 0 } },
    select: { startedAt: true, endedAt: true },
  });
  if (!closed && !(corrected && corrected.endedAt && corrected.endedAt > corrected.startedAt)) {
    blockers.push({ code: 'WORK_TIME', message: 'No work time has been recorded for this job. Clock in and complete your work session before submitting for approval.' });
  }
  return blockers;
}
