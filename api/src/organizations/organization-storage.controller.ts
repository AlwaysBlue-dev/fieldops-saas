import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { ListStorageFilesQueryDto } from './dto/list-storage-files-query.dto.js';
import { OrganizationStorageService } from './organization-storage.service.js';

@Controller('organizations/:organizationId/storage')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
@OrganizationRoles(
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
)
export class OrganizationStorageController {
  constructor(private readonly storage: OrganizationStorageService) {}

  @Get('usage')
  usage(@CurrentOrganization() organization: OrganizationContext) {
    return this.storage.usage(organization);
  }

  @Get('files')
  files(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListStorageFilesQueryDto,
  ) {
    return this.storage.listFiles(organization, query);
  }
}
