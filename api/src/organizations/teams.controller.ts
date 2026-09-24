import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { CREW_MANAGE_ROLES } from './crew-access.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import {
  AssignSupervisorDto,
  AssignTeamMemberDto,
  UpdateTeamDto,
} from './dto/update-team.dto.js';
import { TeamsService } from './teams.service.js';

@Controller('organizations/:organizationId/teams')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListQueryDto,
  ) {
    return this.teams.list(organization, user.id, query);
  }

  @Post()
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teams.create(organization, dto, user.id);
  }

  @Get(':teamId')
  getTeam(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teams.get(organization, user.id, teamId);
  }

  @Patch(':teamId')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teams.update(organization, teamId, dto, user.id);
  }

  @Post(':teamId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  deactivate(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teams.deactivate(organization, teamId, user.id);
  }

  @Post(':teamId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  reactivate(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teams.reactivate(organization, teamId, user.id);
  }

  @Post(':teamId/supervisor')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  assignSupervisor(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: AssignSupervisorDto,
  ) {
    return this.teams.assignSupervisor(
      organization,
      teamId,
      dto.supervisorUserId,
      user.id,
    );
  }

  @Post(':teamId/members')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  addMember(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: AssignTeamMemberDto,
  ) {
    return this.teams.addMember(organization, teamId, dto.userId, user.id);
  }

  @Post(':teamId/members/:userId/remove')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  removeMember(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ) {
    return this.teams.removeMember(organization, teamId, userId, user.id);
  }
}
