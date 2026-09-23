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
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { CreateSiteDto } from './dto/create-site.dto.js';
import { ListQueryDto } from './dto/list-query.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { SitesService } from './sites.service.js';

const CATALOG_ROLES = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
] as const;

@Controller('organizations/:organizationId/clients')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly sites: SitesService,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListQueryDto,
  ) {
    return this.clients.list(organization.organizationId, query);
  }

  @Post()
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateClientDto,
  ) {
    return this.clients.create(organization, dto, user.id);
  }

  @Get(':clientId')
  getClient(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('clientId') clientId: string,
  ) {
    return this.clients.get(organization.organizationId, clientId);
  }

  @Patch(':clientId')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(organization, clientId, dto, user.id);
  }

  @Post(':clientId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  deactivate(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
  ) {
    return this.clients.deactivate(organization, clientId, user.id);
  }

  @Get(':clientId/sites')
  listSites(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('clientId') clientId: string,
    @Query() query: ListQueryDto,
  ) {
    return this.sites.listForClient(organization.organizationId, clientId, query);
  }

  @Post(':clientId/sites')
  @RequiresActiveSubscription()
  @OrganizationRoles(...CATALOG_ROLES)
  createSite(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateSiteDto,
  ) {
    return this.sites.create(organization, clientId, dto, user.id);
  }
}
