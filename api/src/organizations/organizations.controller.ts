import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { AdvanceOnboardingDto } from './dto/advance-onboarding.dto.js';
import {
  UpdateOrganizationDto,
  UpdateOrganizationSettingsDto,
} from './dto/update-organization.dto.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  get(@CurrentOrganization() organization: OrganizationContext) {
    return this.organizations.get(organization.organizationId);
  }

  @Patch()
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.updateProfile(organization, dto, user.id);
  }

  @Get('settings')
  settings(@CurrentOrganization() organization: OrganizationContext) {
    return this.organizations.get(organization.organizationId);
  }

  @Patch('settings')
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  updateSettings(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrganizationSettingsDto,
  ) {
    return this.organizations.updateSettings(organization, dto, user.id);
  }

  @Get('onboarding')
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  onboarding(@CurrentOrganization() organization: OrganizationContext) {
    return this.organizations.get(organization.organizationId);
  }

  @Post('onboarding')
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  advance(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: AdvanceOnboardingDto,
  ) {
    return this.organizations.advanceOnboarding(organization, dto, user.id);
  }
}
