import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, OrganizationStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './request-context.js';

@Injectable()
export class OrganizationMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new NotFoundException();
    }

    const organizationId = this.readOrganizationId(request);
    if (!organizationId) {
      throw new NotFoundException();
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: user.id,
        status: MembershipStatus.ACTIVE,
        organization: { status: OrganizationStatus.ACTIVE },
      },
      include: { organization: true },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    request.organization = {
      organizationId: membership.organizationId,
      membershipId: membership.id,
      role: membership.role,
      name: membership.organization.name,
      slug: membership.organization.slug,
      timezone: membership.organization.timezone,
      status: membership.organization.status,
    };

    return true;
  }

  private readOrganizationId(request: AuthenticatedRequest): string | undefined {
    const params = request.params as Record<string, string | undefined>;
    if (params.organizationId) {
      return params.organizationId;
    }
    const header = request.headers['x-organization-id'];
    return Array.isArray(header) ? header[0] : header;
  }
}
