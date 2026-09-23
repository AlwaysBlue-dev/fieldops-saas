import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformSubscriptionController } from '../platform/platform-subscription.controller.js';
import { PlatformSubscriptionService } from '../platform/platform-subscription.service.js';
import { SuperAdminGuard } from '../platform/super-admin.guard.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CLOCK, systemClock } from './clock.js';
import { EntitlementService } from './entitlement.service.js';
import { SubscriptionAccessGuard } from './subscription-access.guard.js';
import { SubscriptionAccessService } from './subscription-access.service.js';
import { SubscriptionController } from './subscription.controller.js';
import { SubscriptionNotificationService } from './subscription-notification.service.js';
import { SubscriptionReconciliationService } from './subscription-reconciliation.service.js';
import { SubscriptionService } from './subscription.service.js';
import { UsageService } from './usage.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    CatalogController,
    SubscriptionController,
    PlatformSubscriptionController,
  ],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    CatalogService,
    EntitlementService,
    UsageService,
    SubscriptionAccessService,
    SubscriptionAccessGuard,
    SubscriptionNotificationService,
    SubscriptionReconciliationService,
    SubscriptionService,
    PlatformSubscriptionService,
    SuperAdminGuard,
  ],
  exports: [
    CatalogService,
    EntitlementService,
    UsageService,
    SubscriptionAccessService,
    SubscriptionAccessGuard,
    SubscriptionNotificationService,
    SubscriptionReconciliationService,
    CLOCK,
  ],
})
export class SubscriptionModule {}
