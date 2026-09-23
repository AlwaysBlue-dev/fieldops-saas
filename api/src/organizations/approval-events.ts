import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  NOTIFICATION_JOB_APPROVAL_REQUESTED,
  NOTIFICATION_JOB_APPROVED,
  NOTIFICATION_JOB_RETURNED,
  NOTIFICATION_TIMESHEET_APPROVED,
  NOTIFICATION_TIMESHEET_RETURNED,
  NOTIFICATION_TIMESHEET_SUBMITTED,
} from '../common/constants.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ApprovalDomainEventType =
  | 'JOB_APPROVAL_REQUESTED'
  | 'JOB_APPROVED'
  | 'JOB_RETURNED'
  | 'TIME_APPROVAL_REQUESTED'
  | 'TIME_APPROVED'
  | 'TIME_RETURNED';

export type ApprovalDomainEvent = {
  type: ApprovalDomainEventType;
  organizationId: string;
  approvalId?: string;
  subjectId: string;
  actorUserId: string;
  recipientUserIds: string[];
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ApprovalNotificationHook {
  constructor(private readonly notifications: NotificationsService) {}

  async emit(event: ApprovalDomainEvent, db: Db) {
    const relatedEntityType =
      event.type.startsWith('JOB_') || event.type === 'JOB_APPROVAL_REQUESTED'
        ? 'Job'
        : 'TimeEntry';
    await this.notifications.notify(
      {
        organizationId: event.organizationId,
        recipientUserIds: event.recipientUserIds,
        actorUserId: event.actorUserId,
        type: notificationType(event.type),
        title: event.title,
        message: event.body,
        relatedEntityType,
        relatedEntityId: event.subjectId,
        payload: {
          ...event.payload,
          subjectId: event.subjectId,
          approvalId: event.approvalId ?? null,
          actorUserId: event.actorUserId,
        },
        dedupeUnread:
          event.type === 'JOB_APPROVAL_REQUESTED' ||
          event.type === 'TIME_APPROVAL_REQUESTED',
      },
      db,
    );
  }
}

function notificationType(type: ApprovalDomainEventType) {
  switch (type) {
    case 'JOB_APPROVED':
      return NOTIFICATION_JOB_APPROVED;
    case 'JOB_RETURNED':
      return NOTIFICATION_JOB_RETURNED;
    case 'TIME_APPROVED':
      return NOTIFICATION_TIMESHEET_APPROVED;
    case 'TIME_RETURNED':
      return NOTIFICATION_TIMESHEET_RETURNED;
    case 'TIME_APPROVAL_REQUESTED':
      return NOTIFICATION_TIMESHEET_SUBMITTED;
    default:
      return NOTIFICATION_JOB_APPROVAL_REQUESTED;
  }
}
