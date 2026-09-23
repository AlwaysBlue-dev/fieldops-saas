import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  OrganizationContext,
} from './request-context.js';

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrganizationContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.organization) {
      throw new Error('CurrentOrganization used without OrganizationMembershipGuard');
    }
    return request.organization;
  },
);
