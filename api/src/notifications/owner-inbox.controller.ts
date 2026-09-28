import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { ListNotificationsQueryDto } from './dto/list-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Owner Inbox — platform messages for the organization Owner.
 * Usable while the workspace is read-only (no subscription guard).
 */
@Controller('organizations/:organizationId/owner-inbox')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
@OrganizationRoles(OrganizationRole.OWNER)
export class OwnerInboxController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.listOwnerInbox(organization, user.id, {
      unreadOnly: query.unreadOnly,
      take: query.take,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('unread-count')
  unreadCount(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.ownerInboxUnreadCount(organization, user.id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.markOwnerInboxAllRead(organization, user.id);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markOwnerInboxRead(
      organization,
      user.id,
      notificationId,
    );
  }

  @Patch(':notificationId/unread')
  @HttpCode(HttpStatus.OK)
  markUnread(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markOwnerInboxUnread(
      organization,
      user.id,
      notificationId,
    );
  }
}
