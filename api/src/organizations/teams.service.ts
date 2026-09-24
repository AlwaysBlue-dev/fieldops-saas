import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_TEAM_CREATED,
  AUDIT_TEAM_MEMBER_ADDED,
  AUDIT_TEAM_MEMBER_REMOVED,
  AUDIT_TEAM_SUPERVISOR_CHANGED,
  AUDIT_TEAM_UPDATED,
} from '../common/constants.js';
import {
  EntityStatus,
  MembershipStatus,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withTenant } from '../tenancy/tenant-scope.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { canManageCrew } from './crew-access.js';
import { serializeCertification, serializeTeamSummary } from './crew-serializer.js';
import type { CreateTeamDto } from './dto/create-team.dto.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import type { UpdateTeamDto } from './dto/update-team.dto.js';
import { emptyToNull } from './dto/text.util.js';

const TEAM_SORT = new Set(['name', 'createdAt', 'updatedAt', 'status']);

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  teamVisibilityWhere(
    ctx: OrganizationContext,
    actorUserId: string,
  ): Prisma.TeamWhereInput {
    const base: Prisma.TeamWhereInput = { organizationId: ctx.organizationId };
    if (canManageCrew(ctx.role)) {
      return base;
    }
    return {
      ...base,
      OR: [
        { supervisorUserId: actorUserId },
        { members: { some: { userId: actorUserId } } },
      ],
    };
  }

  async listVisibleTeamIds(ctx: OrganizationContext, actorUserId: string) {
    const teams = await this.prisma.team.findMany({
      where: this.teamVisibilityWhere(ctx, actorUserId),
      select: { id: true },
    });
    return teams.map((team) => team.id);
  }

  async list(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ListQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = TEAM_SORT.has(query.sort ?? '') ? query.sort! : 'name';
    const order = query.order ?? 'asc';
    const search = query.search?.trim();

    const where: Prisma.TeamWhereInput = {
      ...this.teamVisibilityWhere(ctx, actorUserId),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              {
                supervisor: {
                  fullName: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.team.count({ where }),
      this.prisma.team.findMany({
        where,
        include: {
          supervisor: { select: { id: true, fullName: true } },
          members: {
            include: {
              user: {
                select: { id: true, fullName: true },
              },
            },
            orderBy: { joinedAt: 'asc' },
          },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const memberUserIds = [
      ...new Set(rows.flatMap((row) => row.members.map((member) => member.userId))),
    ];
    const [memberships, skills] = await Promise.all([
      memberUserIds.length
        ? this.prisma.organizationMember.findMany({
            where: {
              organizationId: ctx.organizationId,
              userId: { in: memberUserIds },
            },
            select: { userId: true, role: true },
          })
        : Promise.resolve([]),
      memberUserIds.length
        ? this.prisma.technicianSkill.findMany({
            where: {
              organizationId: ctx.organizationId,
              userId: { in: memberUserIds },
            },
            include: { skill: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);
    const roleByUser = new Map(memberships.map((row) => [row.userId, row.role]));
    const skillsByUser = new Map<string, string[]>();
    for (const row of skills) {
      const current = skillsByUser.get(row.userId) ?? [];
      current.push(row.skill.name);
      skillsByUser.set(row.userId, current);
    }

    return {
      items: rows.map((row) => {
        const skillNames = [
          ...new Set(
            row.members.flatMap((member) => skillsByUser.get(member.userId) ?? []),
          ),
        ].sort((a, b) => a.localeCompare(b));
        return serializeTeamSummary({
          ...row,
          memberCount: row.members.length,
          members: row.members.map((member) => ({
            userId: member.user.id,
            fullName: member.user.fullName,
            role: roleByUser.get(member.userId) ?? null,
          })),
          skillNames,
        });
      }),
      page,
      pageSize,
      total,
    };
  }

  async get(ctx: OrganizationContext, actorUserId: string, teamId: string) {
    const team = await this.requireVisibleTeam(ctx, actorUserId, teamId);
    const memberUserIds = team.members.map((member) => member.userId);
    const [memberships, skills, certifications] = await Promise.all([
      memberUserIds.length
        ? this.prisma.organizationMember.findMany({
            where: {
              organizationId: ctx.organizationId,
              userId: { in: memberUserIds },
            },
            select: { userId: true, role: true, status: true },
          })
        : Promise.resolve([]),
      memberUserIds.length
        ? this.prisma.technicianSkill.findMany({
            where: {
              organizationId: ctx.organizationId,
              userId: { in: memberUserIds },
            },
            include: { skill: true },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      memberUserIds.length
        ? this.prisma.technicianCertification.findMany({
            where: {
              organizationId: ctx.organizationId,
              userId: { in: memberUserIds },
            },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
    ]);
    const membershipByUser = new Map(
      memberships.map((row) => [row.userId, row]),
    );
    const viewer = canManageCrew(ctx.role)
      ? 'manager'
      : ctx.role === OrganizationRole.SUPERVISOR
        ? 'supervisor'
        : 'teammate';
    const now = new Date();
    const skillNames = [
      ...new Set(skills.map((row) => row.skill.name)),
    ].sort((a, b) => a.localeCompare(b));

    return {
      ...serializeTeamSummary({
        ...team,
        memberCount: team.members.length,
        members: team.members.map((member) => ({
          userId: member.user.id,
          fullName: member.user.fullName,
          role: membershipByUser.get(member.userId)?.role ?? null,
        })),
        skillNames,
      }),
      members: team.members.map((member) => ({
        userId: member.user.id,
        fullName: member.user.fullName,
        role: membershipByUser.get(member.userId)?.role ?? null,
        membershipStatus: membershipByUser.get(member.userId)?.status ?? null,
        joinedAt: member.joinedAt.toISOString(),
        skills: skills
          .filter((row) => row.userId === member.userId)
          .map((row) => ({
            id: row.id,
            skillId: row.skillId,
            name: row.skill.name,
          })),
      })),
      skills: skillNames.map((name) => {
        const rows = skills.filter((row) => row.skill.name === name);
        return {
          name,
          skillId: rows[0]?.skillId ?? null,
          memberCount: rows.length,
          holders: rows.map((row) => ({
            userId: row.userId,
            fullName:
              team.members.find((member) => member.userId === row.userId)?.user
                .fullName ?? '',
            assignmentId: row.id,
          })),
        };
      }),
      certifications: certifications.map((row) => ({
        ...serializeCertification(row, now, viewer),
        holderName:
          team.members.find((member) => member.userId === row.userId)?.user
            .fullName ?? '',
      })),
    };
  }

  async create(ctx: OrganizationContext, dto: CreateTeamDto, actorUserId: string) {
    if (dto.supervisorUserId) {
      await this.requireActiveMember(ctx.organizationId, dto.supervisorUserId);
    }
    try {
      const team = await this.prisma.$transaction(async (tx) => {
        const created = await tx.team.create({
          data: {
            organizationId: ctx.organizationId,
            name: dto.name.trim(),
            code: emptyToNull(dto.code),
            description: emptyToNull(dto.description),
            supervisorUserId: dto.supervisorUserId ?? null,
          },
          include: {
            supervisor: { select: { id: true, fullName: true } },
            members: {
              include: { user: { select: { id: true, fullName: true } } },
            },
          },
        });
        await this.audit.record(
          {
            action: AUDIT_TEAM_CREATED,
            entityType: 'Team',
            entityId: created.id,
            organizationId: ctx.organizationId,
            actorUserId,
            newValues: {
              name: created.name,
              code: created.code,
              supervisorUserId: created.supervisorUserId,
            },
          },
          tx,
        );
        return created;
      });
      return serializeTeamSummary({
        ...team,
        members: team.members.map((member) => ({
          userId: member.user.id,
          fullName: member.user.fullName,
          role: null,
        })),
      });
    } catch (error) {
      this.throwTeamConflict(error);
    }
  }

  async update(
    ctx: OrganizationContext,
    teamId: string,
    dto: UpdateTeamDto,
    actorUserId: string,
  ) {
    const existing = await this.requireTeam(ctx.organizationId, teamId);
    if (dto.supervisorUserId) {
      await this.requireActiveMember(ctx.organizationId, dto.supervisorUserId);
    }
    const supervisorChanging =
      dto.supervisorUserId !== undefined &&
      dto.supervisorUserId !== existing.supervisorUserId;
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.team.update({
          where: { id: existing.id },
          data: {
            name: dto.name?.trim(),
            code: dto.code !== undefined ? emptyToNull(dto.code) : undefined,
            description:
              dto.description !== undefined
                ? emptyToNull(dto.description)
                : undefined,
            supervisorUserId:
              dto.supervisorUserId !== undefined
                ? dto.supervisorUserId
                : undefined,
            status: dto.status,
          },
          include: {
            supervisor: { select: { id: true, fullName: true } },
            members: {
              include: { user: { select: { id: true, fullName: true } } },
            },
          },
        });
        await this.audit.record(
          {
            action: AUDIT_TEAM_UPDATED,
            entityType: 'Team',
            entityId: next.id,
            organizationId: ctx.organizationId,
            actorUserId,
            oldValues: {
              name: existing.name,
              code: existing.code,
              supervisorUserId: existing.supervisorUserId,
              status: existing.status,
            },
            newValues: {
              name: next.name,
              code: next.code,
              supervisorUserId: next.supervisorUserId,
              status: next.status,
            },
          },
          tx,
        );
        if (supervisorChanging) {
          await this.audit.record(
            {
              action: AUDIT_TEAM_SUPERVISOR_CHANGED,
              entityType: 'Team',
              entityId: next.id,
              organizationId: ctx.organizationId,
              actorUserId,
              oldValues: { supervisorUserId: existing.supervisorUserId },
              newValues: { supervisorUserId: next.supervisorUserId },
            },
            tx,
          );
        }
        return next;
      });
      return serializeTeamSummary({
        ...updated,
        members: updated.members.map((member) => ({
          userId: member.user.id,
          fullName: member.user.fullName,
          role: null,
        })),
      });
    } catch (error) {
      this.throwTeamConflict(error);
    }
  }

  async deactivate(ctx: OrganizationContext, teamId: string, actorUserId: string) {
    return this.update(
      ctx,
      teamId,
      { status: EntityStatus.INACTIVE },
      actorUserId,
    );
  }

  async reactivate(ctx: OrganizationContext, teamId: string, actorUserId: string) {
    return this.update(
      ctx,
      teamId,
      { status: EntityStatus.ACTIVE },
      actorUserId,
    );
  }

  async assignSupervisor(
    ctx: OrganizationContext,
    teamId: string,
    supervisorUserId: string | null,
    actorUserId: string,
  ) {
    return this.update(ctx, teamId, { supervisorUserId }, actorUserId);
  }

  async addMember(
    ctx: OrganizationContext,
    teamId: string,
    userId: string,
    actorUserId: string,
  ) {
    const team = await this.requireTeam(ctx.organizationId, teamId);
    if (team.status !== EntityStatus.ACTIVE) {
      throw new BadRequestException('Cannot add members to an inactive team');
    }
    await this.requireActiveMember(ctx.organizationId, userId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.teamMember.create({
          data: {
            organizationId: ctx.organizationId,
            teamId: team.id,
            userId,
          },
        });
        await this.audit.record(
          {
            action: AUDIT_TEAM_MEMBER_ADDED,
            entityType: 'TeamMember',
            entityId: team.id,
            organizationId: ctx.organizationId,
            actorUserId,
            newValues: { teamId: team.id, userId },
          },
          tx,
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('That person is already on this team');
      }
      throw error;
    }
    return this.get(ctx, actorUserId, team.id);
  }

  async removeMember(
    ctx: OrganizationContext,
    teamId: string,
    userId: string,
    actorUserId: string,
  ) {
    const team = await this.requireTeam(ctx.organizationId, teamId);
    const membership = await this.prisma.teamMember.findFirst({
      where: withTenant(ctx.organizationId, { teamId: team.id, userId }),
    });
    if (!membership) {
      throw new NotFoundException();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.delete({ where: { id: membership.id } });
      await this.audit.record(
        {
          action: AUDIT_TEAM_MEMBER_REMOVED,
          entityType: 'TeamMember',
          entityId: team.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { teamId: team.id, userId },
        },
        tx,
      );
    });
    return this.get(ctx, actorUserId, team.id);
  }

  async requireTeam(organizationId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: withTenant(organizationId, { id: teamId }),
    });
    if (!team) {
      throw new NotFoundException();
    }
    return team;
  }

  async requireActiveTeam(organizationId: string, teamId: string) {
    const team = await this.requireTeam(organizationId, teamId);
    if (team.status !== EntityStatus.ACTIVE) {
      throw new BadRequestException('Team is not active');
    }
    return team;
  }

  private async requireVisibleTeam(
    ctx: OrganizationContext,
    actorUserId: string,
    teamId: string,
  ) {
    const team = await this.prisma.team.findFirst({
      where: {
        ...this.teamVisibilityWhere(ctx, actorUserId),
        id: teamId,
      },
      include: {
        supervisor: { select: { id: true, fullName: true } },
        members: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!team) {
      throw new NotFoundException();
    }
    return team;
  }

  private async requireActiveMember(organizationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new BadRequestException(
        'Supervisor or member must be an active organization member',
      );
    }
    return member;
  }

  private throwTeamConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join('.') : String(target ?? '');
      if (fields.includes('code')) {
        throw new ConflictException(
          'A team with this code already exists in the organization',
        );
      }
      throw new ConflictException(
        'A team with this name already exists in the organization',
      );
    }
    throw error;
  }
}
