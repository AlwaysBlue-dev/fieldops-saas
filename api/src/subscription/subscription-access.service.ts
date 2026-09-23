import { Injectable } from '@nestjs/common';
import { EntitlementService } from './entitlement.service.js';
import type { Entitlement } from './entitlement.js';
import { UsageService } from './usage.service.js';

/**
 * Compatibility facade for existing call sites.
 * Prefer EntitlementService / UsageService for new code.
 */
@Injectable()
export class SubscriptionAccessService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly usageService: UsageService,
  ) {}

  evaluate(organizationId: string, now?: Date): Promise<Entitlement> {
    return this.entitlements.evaluate(organizationId, now);
  }

  usageForSubscription(organizationId: string) {
    return this.usageService.usageForSubscription(organizationId);
  }

  /** @deprecated Prefer usageForSubscription / UsageService.getSummary */
  async usage(
    organizationId: string,
    _includedUsers: number,
    _includedBytes: string,
  ) {
    return this.usageService.usageForSubscription(organizationId);
  }

  assertSeatAvailable(
    organizationId: string,
    reservingInvite = true,
    actorUserId?: string | null,
  ) {
    return this.usageService.assertSeatAvailable(organizationId, {
      reservingInvite,
      actorUserId,
    });
  }

  assertStorageAvailable(
    organizationId: string,
    incomingBytes: number,
    actorUserId?: string | null,
  ) {
    return this.usageService.assertStorageAvailable(organizationId, incomingBytes, {
      actorUserId,
    });
  }
}
