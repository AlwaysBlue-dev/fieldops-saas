import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { InvitationsService } from './invitations.service.js';

@Controller('organizations/:organizationId/invitations')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
@OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(@CurrentOrganization() organization: OrganizationContext) {
    return this.invitations.list(organization.organizationId);
  }

  @Post()
  @RequiresActiveSubscription()
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(organization, dto, user.id);
  }

  @Post(':invitationId/resend')
  @RequiresActiveSubscription()
  @HttpCode(HttpStatus.OK)
  resend(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.resend(organization, invitationId, user.id);
  }

  @Post(':invitationId/revoke')
  @RequiresActiveSubscription()
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.revoke(organization, invitationId, user.id);
  }
}
