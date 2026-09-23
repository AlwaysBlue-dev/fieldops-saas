import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '../generated/prisma/client.js';
import { ORGANIZATION_ROLES_KEY } from './organization-roles.decorator.js';
import type { AuthenticatedRequest } from './request-context.js';

@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<OrganizationRole[]>(
      ORGANIZATION_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.organization?.role;
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    return true;
  }
}
