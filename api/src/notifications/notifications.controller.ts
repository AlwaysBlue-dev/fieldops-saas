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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('organizations/:organizationId/notifications')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(organization, user.id, {
      unreadOnly: query.unreadOnly,
      take: query.take,
    });
  }

  @Get('unread-count')
  unreadCount(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.unreadCount(organization, user.id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.markAllRead(organization, user.id);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.markRead(organization, user.id, notificationId);
  }
}
