import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_OWNER_MESSAGE_SENT,
  NOTIFICATION_OWNER_MESSAGE,
  type OwnerMessageCategory,
} from '../common/constants.js';
import {
  MembershipStatus,
  NotificationStatus,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
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

export type CreateOwnerMessageInput = {
  organizationId: string;
  subject: string;
  message: string;
  category: OwnerMessageCategory;
  ctaLabel?: string | null;
  ctaPath?: string | null;
  actorUserId: string;
};

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    query: {
      unreadOnly?: boolean;
      take?: number;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.assertActiveMember(ctx.organizationId, actorUserId);
    const page = query.page ?? 1;
    const pageSize = Math.min(
      Math.max(query.pageSize ?? query.take ?? 40, 1),
      100,
    );
    const where = {
      organizationId: ctx.organizationId,
      userId: actorUserId,
      ...(query.unreadOnly ? { status: NotificationStatus.UNREAD } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.serialize(row)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
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

  /**
   * Owner Inbox — organization-scoped platform messages.
   * Visible to the current Owner; usable while the workspace is read-only.
   */
  async createOwnerMessage(input: CreateOwnerMessageInput, transaction?: Prisma.TransactionClient) {
    const db = transaction ?? this.prisma;
    const organization = await db.organization.findFirst({
      where: { id: input.organizationId },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    const owners = await db.organizationMember.findMany({
      where: {
        organizationId: organization.id,
        role: OrganizationRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
      select: { userId: true },
    });
    if (owners.length === 0) {
      throw new BadRequestException(
        'This organization has no active owner to receive the message.',
      );
    }

    const ctaPath = this.normalizeOwnerCtaPath(input.ctaPath);
    const ctaLabel = input.ctaLabel?.trim() || null;
    if (ctaPath && !ctaLabel) {
      throw new BadRequestException('CTA label is required when a path is set.');
    }

    const writeMessage = async (tx: Prisma.TransactionClient) => {
      const message = await tx.ownerMessage.create({
        data: {
          organizationId: organization.id,
          subject: input.subject.trim(),
          body: input.message.trim(),
          category: input.category,
          ctaLabel,
          ctaPath,
          createdByUserId: input.actorUserId,
        },
      });

      await this.audit.record(
        {
          action: AUDIT_OWNER_MESSAGE_SENT,
          entityType: 'OwnerMessage',
          entityId: message.id,
          actorUserId: input.actorUserId,
          organizationId: organization.id,
          newValues: {
            subject: message.subject,
            category: message.category,
            recipientOwnerCount: owners.length,
          },
        },
        tx,
      );

      return message;
    };
    const created = transaction ? await writeMessage(transaction) : await this.prisma.$transaction(writeMessage);

    return {
      id: created.id,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      subject: created.subject,
      category: created.category,
      recipientCount: owners.length,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async listOwnerInbox(
    ctx: OrganizationContext,
    actorUserId: string,
    query: {
      unreadOnly?: boolean;
      take?: number;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.assertActiveOwner(ctx.organizationId, actorUserId);
    const page = query.page ?? 1;
    const pageSize = Math.min(
      Math.max(query.pageSize ?? query.take ?? 40, 1),
      100,
    );

    const messages = await this.prisma.ownerMessage.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        receipts: {
          where: { userId: actorUserId },
          take: 1,
        },
      },
    });

    const items = messages
      .map((row) => this.serializeOwnerMessage(row, row.receipts[0] ?? null))
      .filter((row) => (query.unreadOnly ? row.status === 'UNREAD' : true));

    const total = items.length;
    const slice = items.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: slice,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async ownerInboxUnreadCount(ctx: OrganizationContext, actorUserId: string) {
    await this.assertActiveOwner(ctx.organizationId, actorUserId);
    const messages = await this.prisma.ownerMessage.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        receipts: {
          where: { userId: actorUserId, status: NotificationStatus.READ },
          select: { id: true },
          take: 1,
        },
      },
    });
    const count = messages.filter((row) => row.receipts.length === 0).length;
    return { count };
  }

  async markOwnerInboxRead(
    ctx: OrganizationContext,
    actorUserId: string,
    messageId: string,
  ) {
    await this.assertActiveOwner(ctx.organizationId, actorUserId);
    const message = await this.requireOwnerMessage(
      ctx.organizationId,
      messageId,
    );
    const existing = await this.prisma.ownerMessageReceipt.findUnique({
      where: { messageId_userId: { messageId: message.id, userId: actorUserId } },
    });
    if (existing?.status === NotificationStatus.READ) {
      return this.serializeOwnerMessage(message, existing);
    }
    const receipt = await this.prisma.$transaction(async (tx) => {
      // The unique message/user key also protects concurrent read-all requests.
      await tx.ownerMessageReceipt.createMany({
        data: [{ messageId: message.id, userId: actorUserId, status: NotificationStatus.READ, readAt: new Date() }],
        skipDuplicates: true,
      });
      await tx.ownerMessageReceipt.updateMany({
        where: { messageId: message.id, userId: actorUserId, status: NotificationStatus.UNREAD },
        data: { status: NotificationStatus.READ, readAt: new Date() },
      });
      return tx.ownerMessageReceipt.findUniqueOrThrow({
        where: { messageId_userId: { messageId: message.id, userId: actorUserId } },
      });
    });
    return this.serializeOwnerMessage(message, receipt);
  }

  async markOwnerInboxUnread(
    ctx: OrganizationContext,
    actorUserId: string,
    messageId: string,
  ) {
    await this.assertActiveOwner(ctx.organizationId, actorUserId);
    const message = await this.requireOwnerMessage(
      ctx.organizationId,
      messageId,
    );
    const receipt = await this.prisma.ownerMessageReceipt.upsert({
      where: {
        messageId_userId: { messageId: message.id, userId: actorUserId },
      },
      create: {
        messageId: message.id,
        userId: actorUserId,
        status: NotificationStatus.UNREAD,
        readAt: null,
      },
      update: {
        status: NotificationStatus.UNREAD,
        readAt: null,
      },
    });
    return this.serializeOwnerMessage(message, receipt);
  }

  async markOwnerInboxAllRead(ctx: OrganizationContext, actorUserId: string) {
    await this.assertActiveOwner(ctx.organizationId, actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const messages = await tx.ownerMessage.findMany({
        where: {
          organizationId: ctx.organizationId,
          receipts: { none: { userId: actorUserId, status: NotificationStatus.READ } },
        },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      if (!messages.length) return { updated: 0 };
      const ids = messages.map((message) => message.id);
      const now = new Date();
      // Existing UNREAD receipts must be updated as well as missing ones inserted.
      const inserted = await tx.ownerMessageReceipt.createMany({
        data: ids.map((messageId) => ({
          messageId, userId: actorUserId, status: NotificationStatus.READ, readAt: now,
        })),
        skipDuplicates: true,
      });
      const changed = await tx.ownerMessageReceipt.updateMany({
        where: { messageId: { in: ids }, userId: actorUserId, status: NotificationStatus.UNREAD },
        data: { status: NotificationStatus.READ, readAt: now },
      });
      return { updated: inserted.count + changed.count };
    });
  }

  private normalizeOwnerCtaPath(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (
      /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
      trimmed.startsWith('//') ||
      trimmed.includes('..')
    ) {
      throw new BadRequestException(
        'CTA path must be a safe internal FieldKeel path (for example /settings/billing).',
      );
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  private async requireOwnerMessage(organizationId: string, messageId: string) {
    const row = await this.prisma.ownerMessage.findFirst({
      where: { id: messageId, organizationId },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
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

  private async assertActiveOwner(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId,
        role: OrganizationRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('Insufficient organization role');
    }
  }

  private serializeOwnerMessage(
    row: {
      id: string;
      organizationId: string;
      subject: string;
      body: string;
      category: string;
      ctaLabel: string | null;
      ctaPath: string | null;
      createdAt: Date;
    },
    receipt: {
      status: NotificationStatus;
      readAt: Date | null;
    } | null,
  ) {
    const status = receipt?.status ?? NotificationStatus.UNREAD;
    return {
      id: row.id,
      organizationId: row.organizationId,
      recipientUserId: null as string | null,
      type: NOTIFICATION_OWNER_MESSAGE,
      title: row.subject,
      message: row.body,
      category: row.category,
      ctaLabel: row.ctaLabel,
      ctaPath: row.ctaPath,
      relatedEntityType: 'OwnerMessage',
      relatedEntityId: row.id,
      payload: {
        category: row.category,
        ctaLabel: row.ctaLabel,
        ctaPath: row.ctaPath,
      },
      status,
      readAt: receipt?.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
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
