import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { ApprovalsService } from './approvals.service.js';
import {
  BulkTimesheetApprovalsDto,
  DecideApprovalDto,
  ListApprovalsQueryDto,
} from './dto/decide-approval.dto.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';

@Controller('organizations/:organizationId/approvals')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListApprovalsQueryDto,
  ) {
    return this.approvals.list(organization, user.id, query);
  }

  @Get(':approvalId')
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('approvalId') approvalId: string,
  ) {
    return this.approvals.get(organization, user.id, approvalId);
  }

  @Post('bulk-timesheets')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.OPERATIONS_MANAGER,
    OrganizationRole.SUPERVISOR,
  )
  bulkTimesheets(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkTimesheetApprovalsDto,
  ) {
    return this.approvals.bulkApproveTimesheets(organization, user.id, dto);
  }

  @Post(':approvalId/decide')
  @HttpCode(HttpStatus.OK)
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
    return this.approvals.decide(organization, user.id, approvalId, dto);
  }
}
