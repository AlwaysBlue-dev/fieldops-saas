import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SubscriptionDeliveryService } from './subscription-delivery.service.js';
import { SubscriptionNotificationService } from './subscription-notification.service.js';

@Module({
  imports: [MailModule, NotificationsModule],
  providers: [SubscriptionNotificationService, SubscriptionDeliveryService],
  exports: [SubscriptionNotificationService, SubscriptionDeliveryService],
})
export class SubscriptionNotificationsModule {}
