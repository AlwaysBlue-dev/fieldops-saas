import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { ClockService } from './clock.service.js';

@Controller('organizations/:organizationId/clock-sessions')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class ClockSessionsController {
  constructor(private readonly clocks: ClockService) {}

  @Get(':sessionId')
  getSession(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.clocks.getSession(organization, user.id, sessionId);
  }
}
