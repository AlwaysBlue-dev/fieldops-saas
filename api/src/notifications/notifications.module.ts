import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { OwnerInboxController } from './owner-inbox.controller.js';
import { PlatformNotificationsController } from './platform-notifications.controller.js';

@Global()
@Module({
  imports: [AuditModule],
  controllers: [NotificationsController, OwnerInboxController, PlatformNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
