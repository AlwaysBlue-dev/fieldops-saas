import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipStatus,
  NotificationStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';

export type NotifyRecipientInput = {
  organizationId: string | null;
  recipientUserIds: string[];
  type: string;
  title: string;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  payload?: Record<string, unknown>;
  /** Skip creating when an unread notice already exists for same user/type/entity. */
  dedupeUnread?: boolean;
  /** Exclude the actor from recipients (default true when actorUserId set). */
  actorUserId?: string | null;
};

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyRecipientInput, db: Db = this.prisma) {
    const excludeActor = input.actorUserId ?? null;
    const recipients = [
      ...new Set(
        input.recipientUserIds.filter(
          (userId) =>
            Boolean(userId) && (!excludeActor || userId !== excludeActor),
        ),
      ),
    ];
    if (recipients.length === 0) return [] as string[];

    let targetIds = recipients;
    if (input.dedupeUnread && input.relatedEntityId) {
      const existing = await db.notification.findMany({
        where: {
          organizationId: input.organizationId,
          userId: { in: recipients },
          type: input.type,
          relatedEntityId: input.relatedEntityId,
          status: NotificationStatus.UNREAD,
        },
        select: { userId: true },
      });
      const already = new Set(existing.map((row) => row.userId));
      targetIds = recipients.filter((id) => !already.has(id));
      if (targetIds.length === 0) return [];
    }

    await db.notification.createMany({
      data: targetIds.map((userId) => ({
        organizationId: input.organizationId,
        userId,
        type: input.type,
        title: input.title,
        body: input.message,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
    return targetIds;
  }

  async list(
    ctx: OrganizationContext,
    actorUserId: string,
    query: { unreadOnly?: boolean; take?: number } = {},
  ) {
    await this.assertActiveMember(ctx.organizationId, actorUserId);
    const take = Math.min(Math.max(query.take ?? 40, 1), 100);
    const rows = await this.prisma.notification.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: actorUserId,
        ...(query.unreadOnly ? { status: NotificationStatus.UNREAD } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return { items: rows.map((row) => this.serialize(row)) };
  }

  async unreadCount(ctx: OrganizationContext, actorUserId: string) {
    await this.assertActiveMember(ctx.organizationId, actorUserId);
    const count = await this.prisma.notification.count({
      where: {
        organizationId: ctx.organizationId,
        userId: actorUserId,
        status: NotificationStatus.UNREAD,
      },
    });
    return { count };
  }

  async markRead(
    ctx: OrganizationContext,
    actorUserId: string,
    notificationId: string,
  ) {
    const row = await this.requireOwn(ctx.organizationId, actorUserId, notificationId);
    if (row.status === NotificationStatus.READ) {
      return this.serialize(row);
    }
    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
    return this.serialize(updated);
  }

  async markAllRead(ctx: OrganizationContext, actorUserId: string) {
    await this.assertActiveMember(ctx.organizationId, actorUserId);
    const result = await this.prisma.notification.updateMany({
      where: {
        organizationId: ctx.organizationId,
        userId: actorUserId,
        status: NotificationStatus.UNREAD,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
    return { updated: result.count };
  }

  private async requireOwn(
    organizationId: string,
    userId: string,
    notificationId: string,
  ) {
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, organizationId, userId },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  private async assertActiveMember(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('Insufficient organization role');
    }
  }

  private serialize(
    row: {
      id: string;
      organizationId: string | null;
      userId: string;
      type: string;
      title: string;
      body: string;
      relatedEntityType: string | null;
      relatedEntityId: string | null;
      payload: Prisma.JsonValue;
      status: NotificationStatus;
      readAt: Date | null;
      createdAt: Date;
    },
  ) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      recipientUserId: row.userId,
      type: row.type,
      title: row.title,
      message: row.body,
      relatedEntityType: row.relatedEntityType,
      relatedEntityId: row.relatedEntityId,
      payload: row.payload,
      status: row.status,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
