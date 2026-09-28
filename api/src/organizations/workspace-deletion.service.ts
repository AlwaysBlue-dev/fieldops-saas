import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EntitlementService } from '../subscription/entitlement.service.js';

@Injectable()
export class WorkspaceDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly entitlements: EntitlementService,
  ) {}

  private async lock(tx: Prisma.TransactionClient, organizationId: string) {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
    const org = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!org || org.deletedAt) throw new NotFoundException('Workspace no longer exists.');
    return org;
  }

  private async owner(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "OrganizationMember"
      WHERE "organizationId" = ${organizationId}::uuid AND "userId" = ${userId}::uuid
      AND role = 'OWNER' AND status = 'ACTIVE' FOR UPDATE
    `;
    if (!rows.length) throw new ForbiddenException('Insufficient permission');
  }

  private async admin(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User" WHERE id = ${userId}::uuid
      AND "platformRole" = 'SUPER_ADMIN' AND status = 'ACTIVE' FOR SHARE
    `;
    if (!rows.length) throw new ForbiddenException('Insufficient permission');
  }

  private async everActivated(tx: Prisma.TransactionClient, organizationId: string) {
    const subscription = await tx.subscription.findUnique({ where: { organizationId } });
    // Free-trial dates alone are deliberately not commercial activation evidence.
    if (subscription && (subscription.activatedAt || subscription.currentPeriodStart ||
      subscription.currentPeriodEnd || ['ACTIVE', 'PAID_GRACE', 'EXPIRED'].includes(subscription.status))) return true;
    const paid = await tx.invoice.findFirst({
      where: { organizationId, OR: [{ paidAt: { not: null } }, { paymentVerifiedAt: { not: null } }, { status: 'PAID' }] },
      select: { id: true },
    });
    if (paid) return true;
    return Boolean(await tx.auditLog.findFirst({
      where: { organizationId, action: { in: [
        'ORGANIZATION_ACTIVATED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED',
        'SUBSCRIPTION_PERIOD_SET', 'INVOICE_PAID', 'invoice.payment_verified',
      ] } },
      select: { id: true },
    }));
  }

  status(organizationId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const org = await this.lock(tx, organizationId);
      await this.owner(tx, organizationId, userId);
      const everActivated = await this.everActivated(tx, organizationId);
      const request = await tx.workspaceDeletionRequest.findFirst({
        where: { organizationId }, orderBy: { requestedAt: 'desc' },
      });
      return { organization: { id: org.id, name: org.name, slug: org.slug }, everActivated, request };
    });
  }

  private record(tx: Prisma.TransactionClient, action: string, organizationId: string, actorUserId: string, requestId?: string) {
    return this.audit.record({
      action, organizationId, actorUserId,
      entityType: requestId ? 'WorkspaceDeletionRequest' : 'Organization',
      entityId: requestId ?? organizationId,
    }, tx);
  }

  private async remove(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string) {
    // Retain the graph, billing, audit and S3 references. No hard-delete cascade.
    await tx.organization.update({
      where: { id: organizationId }, data: { status: 'DEACTIVATED', deletedAt: new Date() },
    });
    await tx.organizationMember.updateMany({ where: { organizationId }, data: { status: 'INACTIVE' } });
    await tx.organizationInvitation.updateMany({
      where: { organizationId, status: 'PENDING' }, data: { status: 'REVOKED' },
    });
    await this.record(tx, 'WORKSPACE_DELETED', organizationId, actorUserId);
    return { deleted: true };
  }

  directDelete(organizationId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      await this.owner(tx, organizationId, userId);
      // Serialized with billing writes by the migration's organization-lock trigger.
      if (await this.everActivated(tx, organizationId)) {
        throw new ConflictException('This workspace has been activated. Request workspace deletion for FieldKeel review.');
      }
      return this.remove(tx, organizationId, userId);
    });
  }

  request(organizationId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const org = await this.lock(tx, organizationId);
      await this.owner(tx, organizationId, userId);
      if (!(await this.everActivated(tx, organizationId))) {
        throw new ConflictException('This workspace can be deleted directly. Refresh its deletion status.');
      }
      const pending = await tx.workspaceDeletionRequest.findFirst({ where: { organizationId, status: 'PENDING' } });
      if (pending) return pending;
      const request = await tx.workspaceDeletionRequest.create({
        data: { organizationId, workspaceName: org.name, requestedByUserId: userId },
      });
      await this.record(tx, 'WORKSPACE_DELETION_REQUESTED', organizationId, userId, request.id);
      return request;
    });
  }

  cancel(organizationId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      await this.owner(tx, organizationId, userId);
      const request = await tx.workspaceDeletionRequest.findFirst({ where: { organizationId, status: 'PENDING' } });
      if (!request) throw new ConflictException('No pending deletion request.');
      const updated = await tx.workspaceDeletionRequest.update({
        where: { id: request.id }, data: { status: 'CANCELLED' },
      });
      await this.record(tx, 'WORKSPACE_DELETION_REQUEST_CANCELLED', organizationId, userId, request.id);
      return updated;
    });
  }

  async list(page = 1) {
    const where = {};
    const [items, total] = await Promise.all([
      this.prisma.workspaceDeletionRequest.findMany({
        where, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25,
        include: {
          organization: { select: { slug: true, deletedAt: true, subscription: { select: { status: true, activatedAt: true } } } },
          requestedBy: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.workspaceDeletionRequest.count({ where }),
    ]);
    // Requests can only be created after historical activation is confirmed.
    const rows = await Promise.all(items.map(async (row) => ({
      ...row,
      everActivated: true,
      effectiveStatus: row.organization.subscription
        ? (await this.entitlements.evaluate(row.organizationId)).effectiveStatus
        : 'NONE',
    })));
    return { items: rows, total, page };
  }

  review(requestId: string, userId: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.workspaceDeletionRequest.findUnique({ where: { id: requestId } });
      if (!initial) throw new NotFoundException();
      await this.lock(tx, initial.organizationId);
      await this.admin(tx, userId);
      const request = await tx.workspaceDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (request.status !== 'PENDING') throw new ConflictException('This request is no longer pending.');
      const updated = await tx.workspaceDeletionRequest.update({
        where: { id: requestId }, data: { status: decision, reviewedByUserId: userId, reviewedAt: new Date(), note: note?.trim() || null },
      });
      await this.record(tx, decision === 'APPROVED' ? 'WORKSPACE_DELETION_APPROVED' : 'WORKSPACE_DELETION_REQUEST_REJECTED',
        request.organizationId, userId, requestId);
      if (decision === 'APPROVED') {
        await this.remove(tx, request.organizationId, userId);
      } else if (await tx.organizationMember.count({
        where: { organizationId: request.organizationId, role: 'OWNER', status: 'ACTIVE' },
      })) {
        await this.notifications.createOwnerMessage({
          organizationId: request.organizationId, actorUserId: userId, category: 'GENERAL',
          subject: 'Workspace deletion request was not approved.',
          message: note?.trim() || 'Your workspace remains available. You can view the request status in Settings → Organization → Danger Zone.',
          ctaLabel: 'View settings', ctaPath: '/settings',
        }, tx);
      }
      return updated;
    });
  }
}
