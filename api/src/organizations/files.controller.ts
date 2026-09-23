import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { JobFilesService } from './job-files.service.js';

@Controller('organizations/:organizationId/files')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class FilesController {
  constructor(private readonly files: JobFilesService) {}

  @Get(':fileId')
  getFile(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('fileId') fileId: string,
  ) {
    return this.files.getById(organization, user.id, fileId);
  }
}
