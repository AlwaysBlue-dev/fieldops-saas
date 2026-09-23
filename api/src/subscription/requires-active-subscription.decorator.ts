import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { REQUIRES_ACTIVE_SUBSCRIPTION } from './subscription-access.constants.js';
import { SubscriptionAccessGuard } from './subscription-access.guard.js';

export function RequiresActiveSubscription() {
  return applyDecorators(
    SetMetadata(REQUIRES_ACTIVE_SUBSCRIPTION, true),
    UseGuards(SubscriptionAccessGuard),
  );
}
