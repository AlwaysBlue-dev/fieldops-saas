import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../tenancy/request-context.js';
import { REQUIRES_ACTIVE_SUBSCRIPTION } from './subscription-access.constants.js';
import { readOnlyMessage } from './entitlement.js';
import { SubscriptionAccessService } from './subscription-access.service.js';

@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: SubscriptionAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_ACTIVE_SUBSCRIPTION,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.organization?.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const entitlement = await this.access.evaluate(organizationId);
    request.entitlement = entitlement;
    if (!entitlement.canMutate) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'SUBSCRIPTION_READ_ONLY',
        message: readOnlyMessage(entitlement.effectiveStatus),
      });
    }
    return true;
  }
}
