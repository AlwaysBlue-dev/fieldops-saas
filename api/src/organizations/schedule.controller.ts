import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { ScheduleQueryDto } from './dto/schedule-query.dto.js';
import { ScheduleService } from './schedule.service.js';

@Controller('organizations/:organizationId/schedule')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  getBoard(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ScheduleQueryDto,
  ) {
    return this.schedule.getBoard(organization, user.id, query);
  }
}
