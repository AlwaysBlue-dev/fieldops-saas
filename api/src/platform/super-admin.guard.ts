import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PlatformRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../tenancy/request-context.js';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.platformRole !== PlatformRole.SUPER_ADMIN) {
      throw new ForbiddenException('Platform administrator access required');
    }
    return true;
  }
}
