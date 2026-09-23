import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_ACTIVATION_REQUESTED,
  TRIAL_GRACE_DAYS,
  TRIAL_DAYS,
} from '../common/constants.js';
import type { EnvironmentVariables } from '../config/env.js';
import { ActivationRequestStatus } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { CLOCK, type Clock } from './clock.js';
import type { RequestActivationDto } from './dto/request-activation.dto.js';
import { toSubscriptionDto } from './entitlement.js';
import { SubscriptionAccessService } from './subscription-access.service.js';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SubscriptionAccessService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getForOrganization(organizationId: string) {
    const entitlement = await this.access.evaluate(organizationId);
    return toSubscriptionDto(entitlement);
  }

  async requestActivation(
    organization: OrganizationContext,
    user: AuthUser,
    dto: RequestActivationDto,
  ) {
    const existing = await this.prisma.activationRequest.findFirst({
      where: {
        organizationId: organization.organizationId,
        status: ActivationRequestStatus.OPEN,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException(
        'An activation request is already open for this workspace',
      );
    }

    const organizationRow = await this.prisma.organization.findFirst({
      where: { id: organization.organizationId },
    });
    if (!organizationRow) {
      throw new NotFoundException();
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.activationRequest.create({
        data: {
          organizationId: organization.organizationId,
          requestedByUserId: user.id,
          message: dto.message?.trim() || null,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIVATION_REQUESTED,
          entityType: 'ActivationRequest',
          entityId: created.id,
          organizationId: organization.organizationId,
          actorUserId: user.id,
          newValues: {
            status: created.status,
            message: created.message,
          },
        },
        tx,
      );
      return created;
    });

    const salesEmail =
      this.config.get('PLATFORM_SALES_EMAIL', { infer: true }) ??
      'sales@fieldops.local';
    await this.mail.sendActivationRequest({
      to: salesEmail,
      organizationName: organizationRow.name,
      organizationId: organization.organizationId,
      organizationSlug: organizationRow.slug,
      requesterName: user.fullName,
      requesterEmail: user.email,
      message: request.message,
      trialDays: TRIAL_DAYS,
      graceDays: TRIAL_GRACE_DAYS,
    });

    return {
      id: request.id,
      organizationId: request.organizationId,
      status: request.status,
      message: request.message,
      createdAt: request.createdAt.toISOString(),
    };
  }
}
