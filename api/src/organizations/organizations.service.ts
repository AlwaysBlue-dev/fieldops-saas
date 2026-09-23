import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_WORKING_WEEK, WORK_WEEK_DAYS } from '../common/constants.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { AdvanceOnboardingDto } from './dto/advance-onboarding.dto.js';
import type {
  UpdateOrganizationDto,
  UpdateOrganizationSettingsDto,
} from './dto/update-organization.dto.js';
import {
  normalizeWorkingWeek,
  serializeOrganization,
} from './organization-serializer.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      include: { settings: true },
    });
    if (!organization) {
      throw new NotFoundException();
    }
    return serializeOrganization(organization, organization.settings);
  }

  async updateProfile(
    ctx: OrganizationContext,
    dto: UpdateOrganizationDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.organization.findFirst({
      where: { id: ctx.organizationId },
    });
    if (!existing) {
      throw new NotFoundException();
    }

    const organization = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: ctx.organizationId },
        data: {
          name: dto.name?.trim() || undefined,
          industry: dto.industry?.trim() || undefined,
          phone: dto.phone?.trim() || undefined,
          timezone: dto.timezone,
        },
        include: { settings: true },
      });

      if (dto.timezone && updated.settings) {
        await tx.organizationSettings.update({
          where: { organizationId: ctx.organizationId },
          data: { timezone: dto.timezone },
        });
      }

      await this.audit.record(
        {
          action: 'organization.updated',
          entityType: 'Organization',
          entityId: updated.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: {
            name: existing.name,
            industry: existing.industry,
            phone: existing.phone,
            timezone: existing.timezone,
          },
          newValues: {
            name: updated.name,
            industry: updated.industry,
            phone: updated.phone,
            timezone: updated.timezone,
          },
        },
        tx,
      );

      return updated;
    });

    return this.get(organization.id);
  }

  async updateSettings(
    ctx: OrganizationContext,
    dto: UpdateOrganizationSettingsDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    if (!existing) {
      throw new NotFoundException();
    }

    const workingWeek = dto.workingWeek
      ? this.assertWorkingWeek(dto.workingWeek)
      : undefined;
    const dailyHours = this.assertDailyHours(dto.defaultDailyHoursLimit);

    const settings = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizationSettings.update({
        where: { organizationId: ctx.organizationId },
        data: {
          jobNumberPrefix: dto.jobNumberPrefix,
          workingWeek,
          defaultDailyHoursLimit: dailyHours,
          requireClientSignature: dto.requireClientSignature,
          requireGps: dto.requireGps,
          gpsReviewDistanceMeters: dto.gpsReviewDistanceMeters,
        },
      });

      if (dto.jobNumberPrefix !== undefined || workingWeek || dailyHours !== undefined) {
        await this.audit.record(
          {
            action: 'organization.settings_updated',
            entityType: 'OrganizationSettings',
            entityId: ctx.organizationId,
            organizationId: ctx.organizationId,
            actorUserId,
            oldValues: {
              jobNumberPrefix: existing.jobNumberPrefix,
              workingWeek: normalizeWorkingWeek(existing.workingWeek),
              defaultDailyHoursLimit: Number(existing.defaultDailyHoursLimit),
              requireClientSignature: existing.requireClientSignature,
              requireGps: existing.requireGps,
            },
            newValues: {
              jobNumberPrefix: updated.jobNumberPrefix,
              workingWeek: normalizeWorkingWeek(updated.workingWeek),
              defaultDailyHoursLimit: Number(updated.defaultDailyHoursLimit),
              requireClientSignature: updated.requireClientSignature,
              requireGps: updated.requireGps,
            },
          },
          tx,
        );
      }

      return updated;
    });

    const organization = await this.prisma.organization.findFirstOrThrow({
      where: { id: ctx.organizationId },
    });
    return serializeOrganization(organization, settings);
  }

  async advanceOnboarding(
    ctx: OrganizationContext,
    dto: AdvanceOnboardingDto,
    actorUserId: string,
  ) {
    if (dto.profile) {
      await this.updateProfile(ctx, dto.profile, actorUserId);
    }
    if (dto.settings) {
      await this.updateSettings(ctx, dto.settings, actorUserId);
    }

    const current = await this.prisma.organization.findFirstOrThrow({
      where: { id: ctx.organizationId },
    });
    const nextStep = dto.complete
      ? 5
      : Math.max(current.onboardingStep, dto.step ?? current.onboardingStep);
    const completedAt =
      dto.complete || nextStep >= 5 ? (current.onboardingCompletedAt ?? new Date()) : null;

    const organization = await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        onboardingStep: Math.min(nextStep, 5),
        onboardingCompletedAt: completedAt,
      },
      include: { settings: true },
    });

    if (completedAt && !current.onboardingCompletedAt) {
      await this.audit.record({
        action: 'organization.onboarding_completed',
        entityType: 'Organization',
        entityId: organization.id,
        organizationId: ctx.organizationId,
        actorUserId,
      });
    }

    return serializeOrganization(organization, organization.settings);
  }

  private assertWorkingWeek(days: string[]) {
    const normalized = normalizeWorkingWeek(days);
    if (normalized.some((day) => !(WORK_WEEK_DAYS as readonly string[]).includes(day))) {
      throw new BadRequestException('workingWeek must use MON–SUN codes');
    }
    return normalized.length > 0 ? normalized : [...DEFAULT_WORKING_WEEK];
  }

  private assertDailyHours(value?: number) {
    if (value === undefined) {
      return undefined;
    }
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
      throw new BadRequestException('normal daily hours must be between 1 and 24');
    }
    return hours;
  }
}
