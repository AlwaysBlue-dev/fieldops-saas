import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SuperAdminGuard } from '../platform/super-admin.guard.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import type { AuthUser } from '../tenancy/request-context.js';
import { ListNotificationsQueryDto } from './dto/list-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('platform/notifications')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PlatformNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.listPlatform(user.id, { unreadOnly: query.unreadOnly, page: query.page, pageSize: query.pageSize });
  }

  @Patch(':notificationId/read')
  markRead(@CurrentUser() user: AuthUser, @Param('notificationId') id: string) {
    return this.notifications.markPlatformRead(user.id, id, true);
  }

  @Patch(':notificationId/unread')
  markUnread(@CurrentUser() user: AuthUser, @Param('notificationId') id: string) {
    return this.notifications.markPlatformRead(user.id, id, false);
  }
}
