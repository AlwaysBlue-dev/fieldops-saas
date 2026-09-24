import {
  Body,
  Controller,
  Delete,
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
import {
  CreateCertificationDto,
  UpdateCertificationDto,
} from './dto/certification.dto.js';
import { AssignSkillDto, CreateSkillDto } from './dto/create-skill.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import { TechniciansService } from './technicians.service.js';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class TechniciansController {
  constructor(private readonly technicians: TechniciansService) {}

  @Get('skills')
  listSkills(@CurrentOrganization() organization: OrganizationContext) {
    return this.technicians.listSkills(organization.organizationId);
  }

  @Post('skills')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  createSkill(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSkillDto,
  ) {
    return this.technicians.createSkill(organization, dto, user.id);
  }

  @Get('technicians')
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListQueryDto,
  ) {
    return this.technicians.list(organization, user.id, query);
  }

  @Get('technicians/:userId')
  getTechnician(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ) {
    return this.technicians.get(organization, user.id, userId);
  }

  @Post('technicians/:userId/skills')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  assignSkill(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: AssignSkillDto,
  ) {
    return this.technicians.assignSkill(organization, userId, dto.skillId, user.id);
  }

  @Delete('technicians/:userId/skills/:skillId')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  removeSkill(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.technicians.removeSkill(organization, userId, skillId, user.id);
  }

  @Post('technicians/:userId/certifications')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  addCertification(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: CreateCertificationDto,
  ) {
    return this.technicians.addCertification(organization, userId, dto, user.id);
  }

  @Patch('technicians/:userId/certifications/:certificationId')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  updateCertification(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('certificationId') certificationId: string,
    @Body() dto: UpdateCertificationDto,
  ) {
    return this.technicians.updateCertification(
      organization,
      userId,
      certificationId,
      dto,
      user.id,
    );
  }

  @Delete('technicians/:userId/certifications/:certificationId')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CREW_MANAGE_ROLES)
  removeCertification(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Param('certificationId') certificationId: string,
  ) {
    return this.technicians.removeCertification(
      organization,
      userId,
      certificationId,
      user.id,
    );
  }
}
