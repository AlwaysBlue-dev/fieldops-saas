import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { normalizeEmail } from '../auth/password.js';
import {
  MembershipStatus,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';
import {
  ListMembersQueryDto,
  parseMemberRoles,
} from './dto/list-members-query.dto.js';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: ListMembersQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const roles = parseMemberRoles(query.roles);
    const status = query.status ?? MembershipStatus.ACTIVE;
    const order = query.order ?? 'asc';

    const where: Prisma.OrganizationMemberWhereInput = {
      organizationId,
      status,
      ...(roles ? { role: { in: roles } } : {}),
      ...(search
        ? {
            user: {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const orderBy: Prisma.OrganizationMemberOrderByWithRelationInput[] =
      query.sort === 'email'
        ? [{ user: { email: order } }]
        : query.sort === 'fullName'
          ? [{ user: { fullName: order } }]
          : query.sort === 'joinedAt'
            ? [{ joinedAt: order }]
            : [{ role: order }, { user: { fullName: 'asc' } }];

    const [total, members] = await this.prisma.$transaction([
      this.prisma.organizationMember.count({ where }),
      this.prisma.organizationMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              status: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const seen = new Set<string>();
    const items = members
      .filter((member) => {
        if (seen.has(member.userId)) return false;
        seen.add(member.userId);
        return true;
      })
      .map((member) => ({
        id: member.id,
        organizationId: member.organizationId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        user: member.user,
      }));

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Blocks inviting someone who already has an ACTIVE membership in this org.
   * Membership in another organization is not a conflict.
   */
  async ensureNotAlreadyMember(organizationId: string, email: string) {
    const normalized = normalizeEmail(email);
    const existing = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        user: { email: normalized },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This user is already a member of this organization.',
      );
    }
  }

  async update(
    ctx: OrganizationContext,
    memberId: string,
    dto: UpdateMemberDto,
    actorUserId: string,
  ) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: ctx.organizationId },
    });
    if (!member) {
      throw new NotFoundException();
    }

    if (
      (dto.role && dto.role !== OrganizationRole.OWNER) ||
      dto.status === MembershipStatus.INACTIVE
    ) {
      await this.assertNotLastOwner(
        ctx.organizationId,
        member,
        dto.role,
        dto.status,
      );
    }

    if (
      ctx.role !== OrganizationRole.OWNER &&
      (member.role === OrganizationRole.OWNER ||
        dto.role === OrganizationRole.OWNER)
    ) {
      throw new ForbiddenException('Only owners can manage owner memberships');
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: {
        role: dto.role,
        status: dto.status,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, status: true },
        },
      },
    });

    await this.audit.record({
      action: 'organization.member_updated',
      entityType: 'OrganizationMember',
      entityId: updated.id,
      organizationId: ctx.organizationId,
      actorUserId,
      oldValues: { role: member.role, status: member.status },
      newValues: { role: updated.role, status: updated.status },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      role: updated.role,
      status: updated.status,
      joinedAt: updated.joinedAt,
      user: updated.user,
    };
  }

  async assertNotLastOwner(
    organizationId: string,
    member: { id: string; role: OrganizationRole; status: MembershipStatus },
    nextRole?: OrganizationRole,
    nextStatus?: MembershipStatus,
  ) {
    if (member.role !== OrganizationRole.OWNER || member.status !== MembershipStatus.ACTIVE) {
      return;
    }

    const leavingOwnership =
      (nextRole !== undefined && nextRole !== OrganizationRole.OWNER) ||
      nextStatus === MembershipStatus.INACTIVE;
    if (!leavingOwnership) {
      return;
    }

    const otherOwners = await this.prisma.organizationMember.count({
      where: {
        organizationId,
        role: OrganizationRole.OWNER,
        status: MembershipStatus.ACTIVE,
        id: { not: member.id },
      },
    });
    if (otherOwners === 0) {
      throw new ConflictException(
        'Cannot remove the last active owner from the organization',
      );
    }
  }
}
