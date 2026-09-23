import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { MembersService } from './members.service.js';

@Controller('organizations/:organizationId/members')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
@OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@CurrentOrganization() organization: OrganizationContext) {
    return this.members.list(organization.organizationId);
  }

  @Patch(':memberId')
  @RequiresActiveSubscription()
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.update(organization, memberId, dto, user.id);
  }
}
