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
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { CreateSiteContactDto, UpdateSiteContactDto } from './dto/site-contact.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import { UpdateSiteDto } from './dto/update-site.dto.js';
import { SitesService } from './sites.service.js';

const CATALOG_ROLES = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
] as const;

@Controller('organizations/:organizationId/sites')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListQueryDto,
  ) {
    return this.sites.list(organization.organizationId, query);
  }

  @Get(':siteId')
  getSite(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('siteId') siteId: string,
  ) {
    return this.sites.get(organization.organizationId, siteId);
  }

  @Patch(':siteId')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.sites.update(organization, siteId, dto, user.id);
  }

  @Post(':siteId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  deactivate(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
  ) {
    return this.sites.deactivate(organization, siteId, user.id);
  }

  @Get(':siteId/contacts')
  listContacts(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('siteId') siteId: string,
  ) {
    return this.sites.listContacts(organization.organizationId, siteId);
  }

  @Post(':siteId/contacts')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  createContact(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Body() dto: CreateSiteContactDto,
  ) {
    return this.sites.createContact(organization, siteId, dto, user.id);
  }

  @Patch(':siteId/contacts/:contactId')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  updateContact(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateSiteContactDto,
  ) {
    return this.sites.updateContact(organization, siteId, contactId, dto, user.id);
  }
}
