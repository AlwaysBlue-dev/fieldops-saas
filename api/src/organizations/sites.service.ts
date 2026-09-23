import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_SITE_CREATED,
  AUDIT_SITE_DEACTIVATED,
  AUDIT_SITE_UPDATED,
} from '../common/constants.js';
import { EntityStatus, Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withTenant } from '../tenancy/tenant-scope.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { CreateSiteDto } from './dto/create-site.dto.js';
import type { CreateSiteContactDto, UpdateSiteContactDto } from './dto/site-contact.dto.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import type { UpdateSiteDto } from './dto/update-site.dto.js';
import { emptyToNull } from './dto/text.util.js';
import { serializeSite, serializeSiteContact } from './customer-serializer.js';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForClient(organizationId: string, clientId: string, query: ListQueryDto) {
    await this.requireClient(organizationId, clientId, false);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = query.sort ?? 'name';
    const order = query.order ?? 'asc';
    const search = query.search?.trim();

    const where: Prisma.SiteWhereInput = {
      organizationId,
      clientId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { siteCode: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
              { addressLine1: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.site.count({ where }),
      this.prisma.site.findMany({
        where,
        include: {
          contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => serializeSite(row, { contacts: row.contacts })),
      total,
      page,
      pageSize,
    };
  }

  async get(organizationId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: withTenant(organizationId, { id: siteId }),
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
        client: { select: { id: true, name: true } },
      },
    });
    if (!site) {
      throw new NotFoundException();
    }
    return {
      ...serializeSite(site, { contacts: site.contacts }),
      client: site.client,
    };
  }

  async create(
    ctx: OrganizationContext,
    clientId: string,
    dto: CreateSiteDto,
    actorUserId: string,
  ) {
    await this.requireClient(ctx.organizationId, clientId, true);
    try {
      const site = await this.prisma.$transaction(async (tx) => {
        const created = await tx.site.create({
          data: {
            organizationId: ctx.organizationId,
            clientId,
            name: dto.name.trim(),
            siteCode: emptyToNull(dto.siteCode),
            addressLine1: dto.addressLine1.trim(),
            addressLine2: emptyToNull(dto.addressLine2),
            city: dto.city.trim(),
            region: emptyToNull(dto.stateRegion),
            postalCode: emptyToNull(dto.postalCode),
            country: dto.country.trim(),
            latitude: dto.latitude ?? null,
            longitude: dto.longitude ?? null,
            timezone: emptyToNull(dto.timezone),
            siteContactName: emptyToNull(dto.siteContactName),
            siteContactEmail: emptyToNull(dto.siteContactEmail),
            siteContactPhone: emptyToNull(dto.siteContactPhone),
            notes: emptyToNull(dto.notes),
          },
        });

        if (dto.siteContactName?.trim()) {
          await tx.siteContact.create({
            data: {
              organizationId: ctx.organizationId,
              siteId: created.id,
              name: dto.siteContactName.trim(),
              email: emptyToNull(dto.siteContactEmail),
              phone: emptyToNull(dto.siteContactPhone),
              isPrimary: true,
            },
          });
        }

        await this.audit.record(
          {
            action: AUDIT_SITE_CREATED,
            entityType: 'Site',
            entityId: created.id,
            organizationId: ctx.organizationId,
            actorUserId,
            newValues: { name: created.name, clientId },
          },
          tx,
        );
        return created;
      });
      return this.get(ctx.organizationId, site.id);
    } catch (error) {
      this.throwCodeConflict(error);
    }
  }

  async update(
    ctx: OrganizationContext,
    siteId: string,
    dto: UpdateSiteDto,
    actorUserId: string,
  ) {
    const existing = await this.requireSite(ctx.organizationId, siteId);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.site.update({
          where: { id: existing.id },
          data: {
            name: dto.name?.trim(),
            siteCode: dto.siteCode === undefined ? undefined : emptyToNull(dto.siteCode),
            addressLine1: dto.addressLine1?.trim(),
            addressLine2:
              dto.addressLine2 === undefined ? undefined : emptyToNull(dto.addressLine2),
            city: dto.city?.trim(),
            region: dto.stateRegion === undefined ? undefined : emptyToNull(dto.stateRegion),
            postalCode:
              dto.postalCode === undefined ? undefined : emptyToNull(dto.postalCode),
            country: dto.country?.trim(),
            latitude: dto.latitude,
            longitude: dto.longitude,
            timezone: dto.timezone === undefined ? undefined : emptyToNull(dto.timezone),
            siteContactName:
              dto.siteContactName === undefined
                ? undefined
                : emptyToNull(dto.siteContactName),
            siteContactEmail:
              dto.siteContactEmail === undefined
                ? undefined
                : emptyToNull(dto.siteContactEmail),
            siteContactPhone:
              dto.siteContactPhone === undefined
                ? undefined
                : emptyToNull(dto.siteContactPhone),
            notes: dto.notes === undefined ? undefined : emptyToNull(dto.notes),
            status: dto.status,
          },
        });
        await this.audit.record(
          {
            action: AUDIT_SITE_UPDATED,
            entityType: 'Site',
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
      return this.get(ctx.organizationId, updated.id);
    } catch (error) {
      this.throwCodeConflict(error);
    }
  }

  async deactivate(ctx: OrganizationContext, siteId: string, actorUserId: string) {
    const existing = await this.requireSite(ctx.organizationId, siteId);
    await this.prisma.$transaction(async (tx) => {
      await tx.site.update({
        where: { id: existing.id },
        data: { status: EntityStatus.INACTIVE },
      });
      await this.audit.record(
        {
          action: AUDIT_SITE_DEACTIVATED,
          entityType: 'Site',
          entityId: existing.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: existing.status },
          newValues: { status: EntityStatus.INACTIVE },
        },
        tx,
      );
    });
    return this.get(ctx.organizationId, existing.id);
  }

  async listContacts(organizationId: string, siteId: string) {
    await this.requireSite(organizationId, siteId);
    const contacts = await this.prisma.siteContact.findMany({
      where: { organizationId, siteId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    return contacts.map(serializeSiteContact);
  }

  async createContact(
    ctx: OrganizationContext,
    siteId: string,
    dto: CreateSiteContactDto,
    actorUserId: string,
  ) {
    await this.requireSite(ctx.organizationId, siteId);
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.siteContact.updateMany({
          where: { organizationId: ctx.organizationId, siteId },
          data: { isPrimary: false },
        });
      }
      const created = await tx.siteContact.create({
        data: {
          organizationId: ctx.organizationId,
          siteId,
          name: dto.name.trim(),
          title: emptyToNull(dto.title),
          email: emptyToNull(dto.email),
          phone: emptyToNull(dto.phone),
          isPrimary: dto.isPrimary ?? false,
          notes: emptyToNull(dto.notes),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_SITE_UPDATED,
          entityType: 'Site',
          entityId: siteId,
          organizationId: ctx.organizationId,
          actorUserId,
          metadata: { contactId: created.id, contactCreated: true },
        },
        tx,
      );
      return created;
    });
    return serializeSiteContact(contact);
  }

  async updateContact(
    ctx: OrganizationContext,
    siteId: string,
    contactId: string,
    dto: UpdateSiteContactDto,
    actorUserId: string,
  ) {
    await this.requireSite(ctx.organizationId, siteId);
    const existing = await this.prisma.siteContact.findFirst({
      where: { id: contactId, siteId, organizationId: ctx.organizationId },
    });
    if (!existing) {
      throw new NotFoundException();
    }
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.siteContact.updateMany({
          where: { organizationId: ctx.organizationId, siteId, NOT: { id: contactId } },
          data: { isPrimary: false },
        });
      }
      const updated = await tx.siteContact.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          title: dto.title === undefined ? undefined : emptyToNull(dto.title),
          email: dto.email === undefined ? undefined : emptyToNull(dto.email),
          phone: dto.phone === undefined ? undefined : emptyToNull(dto.phone),
          isPrimary: dto.isPrimary,
          notes: dto.notes === undefined ? undefined : emptyToNull(dto.notes),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_SITE_UPDATED,
          entityType: 'Site',
          entityId: siteId,
          organizationId: ctx.organizationId,
          actorUserId,
          metadata: { contactId: updated.id, contactUpdated: true },
        },
        tx,
      );
      return updated;
    });
    return serializeSiteContact(contact);
  }

  private async requireClient(
    organizationId: string,
    clientId: string,
    requireActive = false,
  ) {
    const client = await this.prisma.client.findFirst({
      where: withTenant(organizationId, { id: clientId }),
    });
    if (!client) {
      throw new NotFoundException();
    }
    if (requireActive && client.status === EntityStatus.INACTIVE) {
      throw new BadRequestException('Cannot add a site to an inactive client');
    }
    return client;
  }

  private async requireSite(organizationId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: withTenant(organizationId, { id: siteId }),
    });
    if (!site) {
      throw new NotFoundException();
    }
    return site;
  }

  private throwCodeConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('A site with this code already exists in the organization');
    }
    throw error;
  }
}
