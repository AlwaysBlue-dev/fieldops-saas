import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SuperAdminGuard } from '../platform/super-admin.guard.js';
import { SubscriptionModule } from '../subscription/subscription.module.js';
import { BillingSettingsService } from './billing-settings.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { InvoiceService } from './invoice.service.js';
import { InvoicesController } from './invoices.controller.js';
import { PlatformBillingController } from './platform-billing.controller.js';

@Module({
  imports: [AuthModule, SubscriptionModule, NotificationsModule],
  controllers: [PlatformBillingController, InvoicesController],
  providers: [
    BillingSettingsService,
    InvoicePdfService,
    InvoiceService,
    SuperAdminGuard,
  ],
  exports: [InvoiceService, BillingSettingsService],
})
export class BillingModule {}
