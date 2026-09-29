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
import { SubscriptionNotificationsModule } from './subscription-notifications.module.js';
import { SubscriptionReconciliationService } from './subscription-reconciliation.service.js';
import { SubscriptionService } from './subscription.service.js';
import { UsageService } from './usage.service.js';
import { StorageQuotaService } from '../storage/storage-quota.service.js';

@Module({
  imports: [AuthModule, SubscriptionNotificationsModule],
  controllers: [
    CatalogController,
    SubscriptionController,
    PlatformSubscriptionController,
  ],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    CatalogService,
    EntitlementService,
    StorageQuotaService,
    UsageService,
    SubscriptionAccessService,
    SubscriptionAccessGuard,
    SubscriptionReconciliationService,
    SubscriptionService,
    PlatformSubscriptionService,
    SuperAdminGuard,
  ],
  exports: [
    CatalogService,
    EntitlementService,
    StorageQuotaService,
    UsageService,
    SubscriptionAccessService,
    SubscriptionAccessGuard,
    SubscriptionNotificationsModule,
    SubscriptionReconciliationService,
    CLOCK,
  ],
})
export class SubscriptionModule {}
