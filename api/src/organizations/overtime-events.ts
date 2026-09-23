import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  NOTIFICATION_OVERTIME_APPROVED,
  NOTIFICATION_OVERTIME_CANCELLED,
  NOTIFICATION_OVERTIME_REJECTED,
  NOTIFICATION_OVERTIME_REQUESTED,
} from '../common/constants.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type OvertimeDomainEventType =
  | 'OVERTIME_REQUESTED'
  | 'OVERTIME_APPROVED'
  | 'OVERTIME_REJECTED'
  | 'OVERTIME_CANCELLED';

export type OvertimeDomainEvent = {
  type: OvertimeDomainEventType;
  organizationId: string;
  authorizationId: string;
  technicianUserId: string;
  actorUserId: string;
  recipientUserIds: string[];
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class OvertimeNotificationHook {
  constructor(private readonly notifications: NotificationsService) {}

  async emit(event: OvertimeDomainEvent, db: Db) {
    await this.notifications.notify(
      {
        organizationId: event.organizationId,
        recipientUserIds: event.recipientUserIds,
        actorUserId:
          event.type === 'OVERTIME_REQUESTED' ? event.actorUserId : null,
        type: notificationType(event.type),
        title: event.title,
        message: event.body,
        relatedEntityType: 'OvertimeAuthorization',
        relatedEntityId: event.authorizationId,
        payload: {
          ...event.payload,
          authorizationId: event.authorizationId,
          technicianUserId: event.technicianUserId,
          actorUserId: event.actorUserId,
        },
        dedupeUnread: event.type === 'OVERTIME_REQUESTED',
      },
      db,
    );
  }
}

function notificationType(type: OvertimeDomainEventType) {
  switch (type) {
    case 'OVERTIME_APPROVED':
      return NOTIFICATION_OVERTIME_APPROVED;
    case 'OVERTIME_REJECTED':
      return NOTIFICATION_OVERTIME_REJECTED;
    case 'OVERTIME_CANCELLED':
      return NOTIFICATION_OVERTIME_CANCELLED;
    default:
      return NOTIFICATION_OVERTIME_REQUESTED;
  }
}
