import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_CERTIFICATION_ADDED,
  AUDIT_CERTIFICATION_REMOVED,
  AUDIT_CERTIFICATION_UPDATED,
  AUDIT_SKILL_ASSIGNED,
  AUDIT_SKILL_REMOVED,
} from '../common/constants.js';
import {
  MembershipStatus,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { canManageCrew, type CrewViewer } from './crew-access.js';
import {
  serializeCertification,
  serializeSkill,
} from './crew-serializer.js';
import type { CreateCertificationDto } from './dto/certification.dto.js';
import type { UpdateCertificationDto } from './dto/certification.dto.js';
import type { CreateSkillDto } from './dto/create-skill.dto.js';
import type { ListQueryDto } from './dto/list-query.dto.js';
import { emptyToNull } from './dto/text.util.js';
import { TeamsService } from './teams.service.js';
import { parseMemberRoles } from './dto/list-members-query.dto.js';

@Injectable()
export class TechniciansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly teams: TeamsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listSkills(organizationId: string) {
    const skills = await this.prisma.skill.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return skills.map((skill) => serializeSkill(skill));
  }

  async createSkill(
    ctx: OrganizationContext,
    dto: CreateSkillDto,
    actorUserId: string,
  ) {
    const name = dto.name.trim();
    const duplicate = await this.prisma.skill.findFirst({
      where: {
        organizationId: ctx.organizationId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'A skill with this name already exists in the organization',
      );
    }
    try {
      const skill = await this.prisma.skill.create({
        data: {
          organizationId: ctx.organizationId,
          name,
        },
      });
      await this.audit.record({
        action: AUDIT_SKILL_ASSIGNED,
        entityType: 'Skill',
        entityId: skill.id,
        organizationId: ctx.organizationId,
        actorUserId,
        newValues: { name: skill.name, catalog: true },
      });
      return serializeSkill(skill);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A skill with this name already exists in the organization',
        );
      }
      throw error;
    }
  }

  async list(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ListQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const roles = parseMemberRoles(query.roles);
    const visibleUserIds = await this.visibleUserIds(ctx, actorUserId, roles);
    if (visibleUserIds.length === 0) {
      return { items: [], page, pageSize, total: 0, totalPages: 1 };
    }

    const where: Prisma.OrganizationMemberWhereInput = {
      organizationId: ctx.organizationId,
      userId: { in: visibleUserIds },
      ...(roles ? { role: { in: roles } } : {}),
      ...(query.status
        ? { status: query.status as never }
        : { status: MembershipStatus.ACTIVE }),
      ...(search
        ? {
            user: this.canSeeContact(ctx, actorUserId)
              ? {
                  OR: [
                    { fullName: { contains: search, mode: 'insensitive' as const } },
                    { email: { contains: search, mode: 'insensitive' as const } },
                  ],
                }
              : { fullName: { contains: search, mode: 'insensitive' as const } },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.organizationMember.count({ where }),
      this.prisma.organizationMember.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
        },
        orderBy: { user: { fullName: 'asc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const [teamMemberships, skills] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: { organizationId: ctx.organizationId, userId: { in: userIds } },
        include: { team: { select: { id: true, name: true, status: true } } },
      }),
      this.prisma.technicianSkill.findMany({
        where: { organizationId: ctx.organizationId, userId: { in: userIds } },
        include: { skill: { select: { name: true } } },
      }),
    ]);

    const seen = new Set<string>();
    const items = rows
      .filter((row) => {
        if (seen.has(row.userId)) return false;
        seen.add(row.userId);
        return true;
      })
      .map((row) => {
        const viewer = this.viewerFor(ctx, actorUserId, row.userId);
        return {
          userId: row.user.id,
          fullName: row.user.fullName,
          role: row.role,
          status: row.status,
          email: this.canSeeContact(ctx, actorUserId, row.userId)
            ? row.user.email
            : null,
          phone: this.canSeeContact(ctx, actorUserId, row.userId)
            ? row.user.phone
            : null,
          teams: teamMemberships
            .filter((item) => item.userId === row.userId)
            .map((item) => ({
              id: item.team.id,
              name: item.team.name,
              status: item.team.status,
            })),
          skills: [
            ...new Set(
              skills
                .filter((item) => item.userId === row.userId)
                .map((item) => item.skill.name),
            ),
          ],
          viewer,
        };
      });

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async get(ctx: OrganizationContext, actorUserId: string, userId: string) {
    if (!canManageCrew(ctx.role)) {
      const visible = await this.visibleUserIds(ctx, actorUserId);
      if (!visible.includes(userId)) {
        throw new NotFoundException();
      }
    }
    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId: ctx.organizationId, userId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException();
    }
    const [teams, skills, certifications] = await Promise.all([
      this.prisma.team.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [
            { supervisorUserId: userId },
            { members: { some: { userId } } },
          ],
        },
        select: {
          id: true,
          name: true,
          status: true,
          supervisorUserId: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.technicianSkill.findMany({
        where: { organizationId: ctx.organizationId, userId },
        include: { skill: true },
        orderBy: { skill: { name: 'asc' } },
      }),
      this.prisma.technicianCertification.findMany({
        where: { organizationId: ctx.organizationId, userId },
        orderBy: { name: 'asc' },
      }),
    ]);
    const viewer = this.viewerFor(ctx, actorUserId, userId);
    const now = this.clock.now();
    return {
      userId: membership.user.id,
      fullName: membership.user.fullName,
      role: membership.role,
      membershipStatus: membership.status,
      accountStatus: membership.user.status,
      email: this.canSeeContact(ctx, actorUserId, userId)
        ? membership.user.email
        : null,
      phone: this.canSeeContact(ctx, actorUserId, userId)
        ? membership.user.phone
        : null,
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        status: team.status,
        isSupervisor: team.supervisorUserId === userId,
      })),
      skills: skills.map((row) => ({
        id: row.id,
        skillId: row.skillId,
        name: row.skill.name,
      })),
      certifications: certifications.map((row) =>
        serializeCertification(row, now, viewer),
      ),
      viewer,
    };
  }

  async assignSkill(
    ctx: OrganizationContext,
    userId: string,
    skillId: string,
    actorUserId: string,
  ) {
    await this.requireOrgMember(ctx.organizationId, userId);
    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, organizationId: ctx.organizationId },
    });
    if (!skill) {
      throw new NotFoundException();
    }
    try {
      const assignment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.technicianSkill.create({
          data: {
            organizationId: ctx.organizationId,
            userId,
            skillId: skill.id,
          },
        });
        await this.audit.record(
          {
            action: AUDIT_SKILL_ASSIGNED,
            entityType: 'TechnicianSkill',
            entityId: created.id,
            organizationId: ctx.organizationId,
            actorUserId,
            newValues: { userId, skillId: skill.id, name: skill.name },
          },
          tx,
        );
        return created;
      });
      return { id: assignment.id, skillId: skill.id, name: skill.name };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('That skill is already assigned');
      }
      throw error;
    }
  }

  async removeSkill(
    ctx: OrganizationContext,
    userId: string,
    skillId: string,
    actorUserId: string,
  ) {
    const assignment = await this.prisma.technicianSkill.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId,
        skillId,
      },
      include: { skill: { select: { name: true } } },
    });
    if (!assignment) {
      throw new NotFoundException();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.technicianSkill.delete({ where: { id: assignment.id } });
      await this.audit.record(
        {
          action: AUDIT_SKILL_REMOVED,
          entityType: 'TechnicianSkill',
          entityId: assignment.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: {
            userId,
            skillId,
            name: assignment.skill.name,
          },
        },
        tx,
      );
    });
    return { removed: true, skillId, userId };
  }

  async addCertification(
    ctx: OrganizationContext,
    userId: string,
    dto: CreateCertificationDto,
    actorUserId: string,
  ) {
    await this.requireOrgMember(ctx.organizationId, userId);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.technicianCertification.create({
        data: {
          organizationId: ctx.organizationId,
          userId,
          name: dto.name.trim(),
          certificateNumber: emptyToNull(dto.certificateNumber),
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          documentRef: emptyToNull(dto.documentRef),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_CERTIFICATION_ADDED,
          entityType: 'TechnicianCertification',
          entityId: row.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { userId, name: row.name },
        },
        tx,
      );
      return row;
    });
    return serializeCertification(created, this.clock.now(), 'manager');
  }

  async updateCertification(
    ctx: OrganizationContext,
    userId: string,
    certificationId: string,
    dto: UpdateCertificationDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.technicianCertification.findFirst({
      where: {
        id: certificationId,
        organizationId: ctx.organizationId,
        userId,
      },
    });
    if (!existing) {
      throw new NotFoundException();
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.technicianCertification.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          certificateNumber:
            dto.certificateNumber !== undefined
              ? emptyToNull(dto.certificateNumber)
              : undefined,
          issuedAt:
            dto.issuedAt === undefined
              ? undefined
              : dto.issuedAt
                ? new Date(dto.issuedAt)
                : null,
          expiresAt:
            dto.expiresAt === undefined
              ? undefined
              : dto.expiresAt
                ? new Date(dto.expiresAt)
                : null,
          documentRef:
            dto.documentRef !== undefined
              ? emptyToNull(dto.documentRef)
              : undefined,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_CERTIFICATION_UPDATED,
          entityType: 'TechnicianCertification',
          entityId: row.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { name: existing.name, expiresAt: existing.expiresAt },
          newValues: { name: row.name, expiresAt: row.expiresAt },
        },
        tx,
      );
      return row;
    });
    return serializeCertification(updated, this.clock.now(), 'manager');
  }

  async removeCertification(
    ctx: OrganizationContext,
    userId: string,
    certificationId: string,
    actorUserId: string,
  ) {
    const existing = await this.prisma.technicianCertification.findFirst({
      where: {
        id: certificationId,
        organizationId: ctx.organizationId,
        userId,
      },
    });
    if (!existing) {
      throw new NotFoundException();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.technicianCertification.delete({ where: { id: existing.id } });
      await this.audit.record(
        {
          action: AUDIT_CERTIFICATION_REMOVED,
          entityType: 'TechnicianCertification',
          entityId: existing.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { userId, name: existing.name },
        },
        tx,
      );
    });
    return { removed: true, id: certificationId, userId };
  }

  private async visibleUserIds(
    ctx: OrganizationContext,
    actorUserId: string,
    roles?: OrganizationRole[],
  ) {
    if (canManageCrew(ctx.role)) {
      const members = await this.prisma.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: MembershipStatus.ACTIVE,
          ...(roles
            ? { role: { in: roles } }
            : {
                OR: [
                  {
                    role: {
                      in: [
                        OrganizationRole.TECHNICIAN,
                        OrganizationRole.SUPERVISOR,
                      ],
                    },
                  },
                  {
                    user: {
                      teamMemberships: {
                        some: { organizationId: ctx.organizationId },
                      },
                    },
                  },
                ],
              }),
        },
        select: { userId: true },
      });
      return [...new Set(members.map((row) => row.userId))];
    }

    const teamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const teammates = teamIds.length
      ? await this.prisma.teamMember.findMany({
          where: { organizationId: ctx.organizationId, teamId: { in: teamIds } },
          select: { userId: true },
        })
      : [];
    const supervised = await this.prisma.team.findMany({
      where: { organizationId: ctx.organizationId, supervisorUserId: actorUserId },
      select: { supervisorUserId: true },
    });
    return [
      ...new Set([
        actorUserId,
        ...teammates.map((row) => row.userId),
        ...supervised
          .map((row) => row.supervisorUserId)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
  }

  private viewerFor(
    ctx: OrganizationContext,
    actorUserId: string,
    targetUserId: string,
  ): CrewViewer {
    if (canManageCrew(ctx.role)) return 'manager';
    if (actorUserId === targetUserId) return 'self';
    if (ctx.role === OrganizationRole.SUPERVISOR) return 'supervisor';
    return 'teammate';
  }

  private canSeeContact(
    ctx: OrganizationContext,
    actorUserId: string,
    targetUserId?: string,
  ) {
    if (canManageCrew(ctx.role)) return true;
    if (ctx.role === OrganizationRole.SUPERVISOR) return true;
    return !targetUserId || actorUserId === targetUserId;
  }

  private async requireOrgMember(organizationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId },
    });
    if (!member) {
      throw new NotFoundException();
    }
    return member;
  }
}
