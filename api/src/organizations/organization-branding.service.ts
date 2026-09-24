import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PHOTO_MIME_TYPES } from '../common/constants.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  detectObjectMime,
  extensionForMime,
  sanitizeOriginalName,
} from '../storage/file-bytes.js';
import {
  belongsToOrganization,
  organizationLogoObjectKey,
} from '../storage/object-key.js';
import { StorageQuotaService } from '../storage/storage-quota.service.js';
import { StorageService } from '../storage/storage.service.js';
import { EntitlementService } from '../subscription/entitlement.service.js';
import { PLAN_FEATURES } from '../subscription/plan-features.js';
import { StorageUploadPurpose } from '../generated/prisma/client.js';
import type { OrganizationContext } from '../tenancy/request-context.js';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIME = PHOTO_MIME_TYPES;

@Injectable()
export class OrganizationBrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
    private readonly storageQuota: StorageQuotaService,
  ) {}

  private async assertOrganizationLogoAllowed(organizationId: string) {
    const allowed = await this.entitlements.hasFeature(
      organizationId,
      PLAN_FEATURES.CUSTOM_BRANDING,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Organization logo branding is not included on your current plan',
      );
    }
  }

  async uploadLogo(
    ctx: OrganizationContext,
    actorUserId: string,
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ) {
    await this.assertOrganizationLogoAllowed(ctx.organizationId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Logo file is required');
    }
    if (file.size > LOGO_MAX_BYTES || file.buffer.length > LOGO_MAX_BYTES) {
      throw new BadRequestException('Logo must be 2 MB or smaller');
    }
    const mimeType = detectObjectMime(file.buffer);
    if (!LOGO_MIME.includes(mimeType as (typeof LOGO_MIME)[number])) {
      throw new BadRequestException('Logo must be JPEG, PNG, or WebP');
    }

    const organization = await this.prisma.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { id: true, logoObjectKey: true, logoUrl: true, logoSizeBytes: true },
    });
    if (!organization) {
      throw new NotFoundException();
    }

    const fileId = randomUUID();
    const objectKey = organizationLogoObjectKey({
      organizationId: ctx.organizationId,
      fileId,
      extension: extensionForMime(mimeType),
    });
    const sizeBytes = BigInt(file.buffer.length);
    const reservation = await this.storageQuota.reserveUpload({
      organizationId: ctx.organizationId,
      userId: actorUserId,
      objectKey,
      originalName: sanitizeOriginalName(file.originalname, 'logo'),
      mimeType,
      sizeBytes,
      purpose: StorageUploadPurpose.ORGANIZATION_LOGO,
      replacingBytes: organization.logoSizeBytes ?? 0n,
      actorUserId,
    });

    try {
      await this.storage.put(objectKey, file.buffer, mimeType);
    } catch (error) {
      await this.storageQuota.failReservation(reservation.id, ctx.organizationId);
      throw error;
    }

    const previousKey = organization.logoObjectKey;
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: ctx.organizationId },
        data: {
          logoObjectKey: objectKey,
          logoUrl: null,
          logoSizeBytes: sizeBytes,
        },
      });
      await this.storageQuota.completeReservation(
        reservation.id,
        ctx.organizationId,
        null,
        tx,
      );
      await this.audit.record(
        {
          action: 'organization.logo_updated',
          entityType: 'Organization',
          entityId: ctx.organizationId,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { hasLogo: Boolean(previousKey) },
          newValues: {
            hasLogo: true,
            mimeType,
            originalName: sanitizeOriginalName(file.originalname, 'logo'),
            sizeBytes: sizeBytes.toString(),
          },
        },
        tx,
      );
    });

    if (previousKey && previousKey !== objectKey) {
      await this.storage.delete(previousKey).catch(() => undefined);
    }

    return { hasLogo: true };
  }

  async removeLogo(ctx: OrganizationContext, actorUserId: string) {
    await this.assertOrganizationLogoAllowed(ctx.organizationId);
    const organization = await this.prisma.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { id: true, logoObjectKey: true },
    });
    if (!organization) {
      throw new NotFoundException();
    }
    const previousKey = organization.logoObjectKey;
    if (previousKey) {
      await this.storage.delete(previousKey, { required: true });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: ctx.organizationId },
        data: { logoObjectKey: null, logoUrl: null, logoSizeBytes: null },
      });
      await this.audit.record(
        {
          action: 'organization.logo_removed',
          entityType: 'Organization',
          entityId: ctx.organizationId,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { hasLogo: Boolean(previousKey) },
          newValues: { hasLogo: false },
        },
        tx,
      );
    });
    return { hasLogo: false };
  }

  async streamLogo(ctx: OrganizationContext) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { logoObjectKey: true },
    });
    if (!organization?.logoObjectKey) {
      throw new NotFoundException();
    }
    if (
      !belongsToOrganization(organization.logoObjectKey, ctx.organizationId)
    ) {
      throw new NotFoundException();
    }
    const object = await this.storage.get(organization.logoObjectKey);
    if (!object) {
      throw new NotFoundException();
    }
    return {
      buffer: object.body,
      mimeType: object.contentType || 'application/octet-stream',
    };
  }
}
