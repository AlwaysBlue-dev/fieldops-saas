import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_CLIENT_CREATED,
  AUDIT_CLIENT_DEACTIVATED,
  AUDIT_CLIENT_UPDATED,
  AUDIT_SITE_CREATED,
} from '../common/constants.js';
import {
  EntityStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withTenant } from '../tenancy/tenant-scope.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { emptyToNull } from './dto/text.util.js';
import type { CreateClientDto } from './dto/create-client.dto.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import type { UpdateClientDto } from './dto/update-client.dto.js';
import { serializeClient, serializeJobSummary, serializeSite } from './customer-serializer.js';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: ListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = query.sort ?? 'name';
    const order = query.order ?? 'asc';
    const search = query.search?.trim();

    const where: Prisma.ClientWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { accountCode: { contains: search, mode: 'insensitive' } },
              { primaryContactName: { contains: search, mode: 'insensitive' } },
              { primaryContactEmail: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        include: {
          _count: { select: { sites: true, jobs: true } },
          jobs: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              jobNumber: true,
              title: true,
              status: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) =>
        serializeClient(row, {
          siteCount: row._count.sites,
          jobCount: row._count.jobs,
          lastActivityAt: row.jobs[0]?.updatedAt ?? row.updatedAt,
          lastJob: row.jobs[0]
            ? {
                jobNumber: row.jobs[0].jobNumber,
                title: row.jobs[0].title,
                status: row.jobs[0].status,
              }
            : null,
        }),
      ),
      total,
      page,
      pageSize,
    };
  }

  async get(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: withTenant(organizationId, { id: clientId }),
      include: {
        _count: { select: { sites: true, jobs: true } },
        sites: {
          orderBy: [{ status: 'asc' }, { name: 'asc' }],
          include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] } },
        },
        jobs: {
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            jobNumber: true,
            title: true,
            status: true,
            scheduledStart: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!client) {
      throw new NotFoundException();
    }

    const siteIds = client.sites.map((site) => site.id);
    const activity = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: [
          { entityType: 'Client', entityId: client.id },
          ...(siteIds.length > 0
            ? [{ entityType: 'Site', entityId: { in: siteIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });

    return {
      ...serializeClient(client, {
        siteCount: client._count.sites,
        jobCount: client._count.jobs,
        lastActivityAt: client.jobs[0]?.updatedAt ?? client.updatedAt,
        lastJob: client.jobs[0]
          ? {
              jobNumber: client.jobs[0].jobNumber,
              title: client.jobs[0].title,
              status: client.jobs[0].status,
            }
          : null,
      }),
      sites: client.sites.map((site) =>
        serializeSite(site, { contacts: site.contacts }),
      ),
      jobs: client.jobs.map(serializeJobSummary),
      activity: activity.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async create(ctx: OrganizationContext, dto: CreateClientDto, actorUserId: string) {
    const primaryEmail = emptyToNull(dto.primaryContactEmail ?? dto.email);
    const primaryPhone = emptyToNull(dto.primaryContactPhone ?? dto.phone);
    try {
      const client = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            organizationId: ctx.organizationId,
            name: dto.name.trim(),
            accountCode: emptyToNull(dto.clientCode),
            email: primaryEmail,
            phone: primaryPhone,
            primaryContactName: emptyToNull(dto.primaryContactName),
            primaryContactEmail: primaryEmail,
            primaryContactPhone: primaryPhone,
            billingEmail: emptyToNull(dto.billingEmail),
            website: emptyToNull(dto.website),
            notes: emptyToNull(dto.notes),
          },
        });
        const siteName = dto.site?.name?.trim();
        if (siteName || dto.site?.addressLine1) {
          const site = await tx.site.create({
            data: {
              organizationId: ctx.organizationId,
              clientId: created.id,
              name: siteName || created.name,
              addressLine1: emptyToNull(dto.site?.addressLine1),
              city: emptyToNull(dto.site?.city),
              country: 'US',
            },
          });
          await this.audit.record(
            {
              action: AUDIT_SITE_CREATED,
              entityType: 'Site',
              entityId: site.id,
              organizationId: ctx.organizationId,
              actorUserId,
              newValues: { name: site.name, clientId: created.id },
            },
            tx,
          );
        }
        await this.audit.record(
          {
            action: AUDIT_CLIENT_CREATED,
            entityType: 'Client',
            entityId: created.id,
            organizationId: ctx.organizationId,
            actorUserId,
            newValues: { name: created.name, clientCode: created.accountCode },
          },
          tx,
        );
        return created;
      });
      return serializeClient(client);
    } catch (error) {
      this.throwCodeConflict(error);
    }
  }

  async update(
    ctx: OrganizationContext,
    clientId: string,
    dto: UpdateClientDto,
    actorUserId: string,
  ) {
    const existing = await this.requireClient(ctx.organizationId, clientId);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.client.update({
          where: { id: existing.id },
          data: {
            name: dto.name?.trim(),
            accountCode:
              dto.clientCode === undefined ? undefined : emptyToNull(dto.clientCode),
            primaryContactName:
              dto.primaryContactName === undefined
                ? undefined
                : emptyToNull(dto.primaryContactName),
            primaryContactEmail:
              dto.primaryContactEmail === undefined
                ? undefined
                : emptyToNull(dto.primaryContactEmail),
            primaryContactPhone:
              dto.primaryContactPhone === undefined
                ? undefined
                : emptyToNull(dto.primaryContactPhone),
            billingEmail:
              dto.billingEmail === undefined ? undefined : emptyToNull(dto.billingEmail),
            website: dto.website === undefined ? undefined : emptyToNull(dto.website),
            notes: dto.notes === undefined ? undefined : emptyToNull(dto.notes),
            email:
              dto.primaryContactEmail === undefined
                ? undefined
                : emptyToNull(dto.primaryContactEmail),
            phone:
              dto.primaryContactPhone === undefined
                ? undefined
                : emptyToNull(dto.primaryContactPhone),
            status: dto.status,
          },
        });
        await this.audit.record(
          {
            action: AUDIT_CLIENT_UPDATED,
            entityType: 'Client',
            entityId: next.id,
            organizationId: ctx.organizationId,
            actorUserId,
            oldValues: { name: existing.name, status: existing.status },
            newValues: { name: next.name, status: next.status },
          },
          tx,
        );
        return next;
      });
      return serializeClient(updated);
    } catch (error) {
      this.throwCodeConflict(error);
    }
  }

  async deactivate(ctx: OrganizationContext, clientId: string, actorUserId: string) {
    const existing = await this.requireClient(ctx.organizationId, clientId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.client.update({
        where: { id: existing.id },
        data: { status: EntityStatus.INACTIVE },
      });
      await this.audit.record(
        {
          action: AUDIT_CLIENT_DEACTIVATED,
          entityType: 'Client',
          entityId: next.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: existing.status },
          newValues: { status: next.status },
        },
        tx,
      );
      return next;
    });
    return serializeClient(updated);
  }

  private async requireClient(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: withTenant(organizationId, { id: clientId }),
    });
    if (!client) {
      throw new NotFoundException();
    }
    return client;
  }

  private throwCodeConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('A client with this code already exists in the organization');
    }
    throw error;
  }
}
