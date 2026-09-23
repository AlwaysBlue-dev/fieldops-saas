import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { DecideApprovalDto } from './dto/decide-approval.dto.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { TenantResourcesService } from './tenant-resources.service.js';

@Controller('organizations/:organizationId/approvals')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class ApprovalsController {
  constructor(private readonly resources: TenantResourcesService) {}

  @Post(':approvalId/decide')
  @RequiresActiveSubscription()
  @OrganizationRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.OPERATIONS_MANAGER,
    OrganizationRole.SUPERVISOR,
  )
  decide(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('approvalId') approvalId: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.resources.decideApproval(organization, approvalId, dto, user.id);
  }
}
