import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import {
  MembershipStatus,
  OrganizationRole,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
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
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    return members.map((member) => ({
      id: member.id,
      organizationId: member.organizationId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      user: member.user,
    }));
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
        id: { not: member.id },
        role: OrganizationRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (otherOwners === 0) {
      throw new ForbiddenException(
        'An active organization must keep at least one owner',
      );
    }
  }

  async ensureNotAlreadyMember(organizationId: string, email: string) {
    const existing = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        user: { email },
      },
    });
    if (existing) {
      throw new ConflictException('That person is already a member');
    }
  }
}
