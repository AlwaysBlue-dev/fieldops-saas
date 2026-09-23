import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { TenantResourcesService } from './tenant-resources.service.js';

@Controller('organizations/:organizationId/files')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class FilesController {
  constructor(private readonly resources: TenantResourcesService) {}

  @Get(':fileId')
  getFile(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('fileId') fileId: string,
  ) {
    return this.resources.getFile(organization.organizationId, fileId);
  }
}
