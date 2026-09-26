import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { RequestActivationDto } from './dto/request-activation.dto.js';
import { SubscriptionService } from './subscription.service.js';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get('subscription')
  get(@CurrentOrganization() organization: OrganizationContext) {
    return this.subscriptions.getForOrganization(organization.organizationId);
  }

  @Get('usage')
  getUsage(@CurrentOrganization() organization: OrganizationContext) {
    return this.subscriptions.getUsage(organization.organizationId);
  }

  @Post('activation-requests')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  requestActivation(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestActivationDto,
  ) {
    return this.subscriptions.requestActivation(organization, user, dto);
  }

  @Post('renewal-requests')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  requestRenewal(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestActivationDto,
  ) {
    return this.subscriptions.requestRenewal(organization, user, dto);
  }

  @Post('plan-change-requests')
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  requestPlanChange(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestActivationDto,
  ) {
    return this.subscriptions.requestPlanChange(organization, user, dto);
  }
}
