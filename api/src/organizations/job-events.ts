import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  NOTIFICATION_JOB_ASSIGNED,
  NOTIFICATION_JOB_RESCHEDULED,
} from '../common/constants.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

export type JobScheduleNotifyInput = {
  organizationId: string;
  organizationName: string;
  orgSlug: string;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  actorUserId: string;
  newlyAssignedUserIds: string[];
  rescheduleUserIds: string[];
  scheduledStart: Date | null;
  expectedFinish: Date | null;
  timezone: string;
};

@Injectable()
export class JobNotificationHook {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  async emitScheduleChanges(input: JobScheduleNotifyInput, db: Db) {
    if (input.newlyAssignedUserIds.length > 0) {
      await this.notifications.notify(
        {
          organizationId: input.organizationId,
          recipientUserIds: input.newlyAssignedUserIds,
          actorUserId: input.actorUserId,
          type: NOTIFICATION_JOB_ASSIGNED,
          title: 'Job assigned',
          message: `${input.jobNumber} · ${input.jobTitle} was assigned to you.`,
          relatedEntityType: 'Job',
          relatedEntityId: input.jobId,
          payload: {
            jobId: input.jobId,
            jobNumber: input.jobNumber,
            orgSlug: input.orgSlug,
          },
          dedupeUnread: true,
        },
        db,
      );
    }

    if (input.rescheduleUserIds.length > 0) {
      await this.notifications.notify(
        {
          organizationId: input.organizationId,
          recipientUserIds: input.rescheduleUserIds,
          actorUserId: input.actorUserId,
          type: NOTIFICATION_JOB_RESCHEDULED,
          title: 'Job rescheduled',
          message: `${input.jobNumber} · ${input.jobTitle} was rescheduled.`,
          relatedEntityType: 'Job',
          relatedEntityId: input.jobId,
          payload: {
            jobId: input.jobId,
            jobNumber: input.jobNumber,
            orgSlug: input.orgSlug,
          },
        },
        db,
      );
    }
  }

  /** Email after the schedule transaction commits. Failures never throw. */
  async emailJobAssigned(input: JobScheduleNotifyInput) {
    if (input.newlyAssignedUserIds.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: input.newlyAssignedUserIds } },
      select: { id: true, email: true, fullName: true },
    });
    for (const user of users) {
      if (user.id === input.actorUserId) continue;
      await this.mail.sendJobAssigned({
        to: user.email,
        recipientName: user.fullName,
        organizationName: input.organizationName,
        orgSlug: input.orgSlug,
        jobNumber: input.jobNumber,
        jobTitle: input.jobTitle,
        scheduledStart: input.scheduledStart,
        expectedFinish: input.expectedFinish,
        timezone: input.timezone,
      });
    }
  }
}
