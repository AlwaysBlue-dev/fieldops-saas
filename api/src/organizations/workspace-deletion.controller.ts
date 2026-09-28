import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, DefaultValuePipe, UseGuards, BadRequestException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationRole } from '../generated/prisma/client.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { SuperAdminGuard } from '../platform/super-admin.guard.js';
import { WorkspaceDeletionService } from './workspace-deletion.service.js';

class ReviewDeletionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

@Controller('organizations/:organizationId/deletion')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
@OrganizationRoles(OrganizationRole.OWNER)
export class WorkspaceDeletionController {
  constructor(private readonly deletion: WorkspaceDeletionService) {}
  @Get()
  status(@CurrentOrganization() org: OrganizationContext, @CurrentUser() user: AuthUser) {
    return this.deletion.status(org.organizationId, user.id);
  }
  @Delete()
  remove(@CurrentOrganization() org: OrganizationContext, @CurrentUser() user: AuthUser) {
    return this.deletion.directDelete(org.organizationId, user.id);
  }
  @Post('request')
  request(@CurrentOrganization() org: OrganizationContext, @CurrentUser() user: AuthUser) {
    return this.deletion.request(org.organizationId, user.id);
  }
  @Post('cancel')
  cancel(@CurrentOrganization() org: OrganizationContext, @CurrentUser() user: AuthUser) {
    return this.deletion.cancel(org.organizationId, user.id);
  }
}

@Controller('platform/workspace-deletion-requests')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PlatformWorkspaceDeletionController {
  constructor(private readonly deletion: WorkspaceDeletionService) {}
  @Get()
  list(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) {
    if (page < 1 || page > 100000) throw new BadRequestException('Invalid page');
    return this.deletion.list(page);
  }
  @Post(':requestId/review')
  review(@Param('requestId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewDeletionDto) {
    return this.deletion.review(id, user.id, dto.decision, dto.note);
  }
}
