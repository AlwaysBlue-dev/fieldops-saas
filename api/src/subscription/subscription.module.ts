import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformSubscriptionController } from '../platform/platform-subscription.controller.js';
import { PlatformSubscriptionService } from '../platform/platform-subscription.service.js';
import { SuperAdminGuard } from '../platform/super-admin.guard.js';
import { CLOCK, systemClock } from './clock.js';
import { SubscriptionAccessGuard } from './subscription-access.guard.js';
import { SubscriptionAccessService } from './subscription-access.service.js';
import { SubscriptionController } from './subscription.controller.js';
import { SubscriptionService } from './subscription.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionController, PlatformSubscriptionController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    SubscriptionAccessService,
    SubscriptionAccessGuard,
    SubscriptionService,
    PlatformSubscriptionService,
    SuperAdminGuard,
  ],
  exports: [SubscriptionAccessService, SubscriptionAccessGuard, CLOCK],
})
export class SubscriptionModule {}
