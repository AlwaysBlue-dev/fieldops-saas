import { Injectable } from '@nestjs/common';
import {
  AUDIT_BILLING_SETTINGS_UPDATED,
} from '../common/constants.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto.js';

@Injectable()
export class BillingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const row = await this.ensure();
    return this.serialize(row);
  }

  async instructionsText() {
    const row = await this.ensure();
    const parts = [
      row.billingLegalName,
      row.billingAddress,
      row.billingEmail ? `Billing email: ${row.billingEmail}` : null,
      row.billingInstructions,
      row.paymentReferenceInstructions,
    ].filter((item): item is string => Boolean(item && item.trim()));
    return parts.length > 0
      ? parts.join('\n\n')
      : 'Sign in to FieldKeel billing to view verified payment instructions after this invoice is issued.';
  }

  async update(actorUserId: string, dto: UpdateBillingSettingsDto) {
    const existing = await this.ensure();
    const updated = await this.prisma.platformBillingSettings.update({
      where: { id: existing.id },
      data: {
        billingLegalName: dto.billingLegalName?.trim() || existing.billingLegalName,
        billingAddress: dto.billingAddress?.trim() || existing.billingAddress,
        billingEmail: dto.billingEmail?.trim() || existing.billingEmail,
        billingInstructions: dto.billingInstructions?.trim() || existing.billingInstructions,
        paymentReferenceInstructions:
          dto.paymentReferenceInstructions?.trim() ||
          existing.paymentReferenceInstructions,
        updatedByUserId: actorUserId,
      },
    });
    await this.audit.record({
      action: AUDIT_BILLING_SETTINGS_UPDATED,
      entityType: 'PlatformBillingSettings',
      entityId: updated.id,
      actorUserId,
    });
    return this.serialize(updated);
  }

  private async ensure() {
    const existing = await this.prisma.platformBillingSettings.findUnique({
      where: { key: 'default' },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.platformBillingSettings.create({
      data: { key: 'default' },
    });
  }

  private serialize(row: {
    billingLegalName: string | null;
    billingAddress: string | null;
    billingEmail: string | null;
    billingInstructions: string | null;
    paymentReferenceInstructions: string | null;
    updatedAt: Date;
  }) {
    return {
      billingLegalName: row.billingLegalName,
      billingAddress: row.billingAddress,
      billingEmail: row.billingEmail,
      billingInstructions: row.billingInstructions,
      paymentReferenceInstructions: row.paymentReferenceInstructions,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
