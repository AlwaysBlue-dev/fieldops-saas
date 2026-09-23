import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_JOB_ASSIGNED,
  AUDIT_JOB_REASSIGNED,
  AUDIT_JOB_RESCHEDULED,
  AUDIT_JOB_SCHEDULED,
  DEFAULT_JOB_WINDOW_MINUTES,
} from '../common/constants.js';
import {
  formatYmdInZone,
  isYmd,
  jobWindow,
  windowsOverlap,
  zonedDayRange,
  zonedWeekRange,
} from '../common/timezone.js';
import {
  EntityStatus,
  JobAssignmentRole,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import { withTenant } from '../tenancy/tenant-scope.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { ScheduleJobDto } from './dto/schedule-job.dto.js';
import type { ScheduleQueryDto } from './dto/schedule-query.dto.js';
import { JobNotificationHook } from './job-events.js';
import {
  canEditSchedule,
  canManageSchedule,
  jobVisibilityWhere,
  TERMINAL_JOB_STATUSES,
} from './job-visibility.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { serializeScheduleJob } from './schedule-serializer.js';
import { TeamsService } from './teams.service.js';

const JOB_INCLUDE = {
  client: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  supervisor: { select: { id: true, fullName: true } },
  assignments: {
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { assignedAt: 'asc' as const },
  },
} satisfies Prisma.JobInclude;

/**
 * Overlap rules (MVP):
 * - Window is [scheduledStart, expectedFinish). Missing finish uses +120 minutes.
 * - COMPLETED / CANCELLED jobs are ignored.
 * - Same technician on two overlapping windows is a conflict.
 * - Default response is 409 SCHEDULE_CONFLICT with conflict rows.
 * - confirmOverlap=true lets an authorized editor persist anyway.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly teams: TeamsService,
    private readonly workflow: JobWorkflowService,
    private readonly jobEvents: JobNotificationHook,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getBoard(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ScheduleQueryDto,
  ) {
    const timeZone = ctx.timezone;
    const date = query.date && isYmd(query.date)
      ? query.date
      : formatYmdInZone(this.clock.now(), timeZone);
    const range = query.range ?? 'day';
    const window =
      range === 'week' ? zonedWeekRange(date, timeZone) : zonedDayRange(date, timeZone);
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const visibility = jobVisibilityWhere(ctx, actorUserId, visibleTeamIds);

    const where: Prisma.JobWhereInput = {
      AND: [
        visibility,
        { status: { notIn: TERMINAL_JOB_STATUSES } },
        query.status ? { status: query.status } : {},
        query.priority ? { priority: query.priority } : {},
        query.clientId ? { clientId: query.clientId } : {},
        query.teamId ? { teamId: query.teamId } : {},
        query.technicianId
          ? { assignments: { some: { userId: query.technicianId } } }
          : {},
      ],
    };

    const jobs = await this.prisma.job.findMany({
      where,
      include: JOB_INCLUDE,
      orderBy: [{ scheduledStart: 'asc' }, { jobNumber: 'asc' }],
    });

    const inRange = jobs.filter((job) => {
      const span = jobWindow(job.scheduledStart, job.expectedFinish);
      if (!span) return false;
      return windowsOverlap(span, window);
    });
    const unassigned = jobs.filter(
      (job) =>
        !job.teamId &&
        job.assignments.length === 0 &&
        !TERMINAL_JOB_STATUSES.includes(job.status),
    );

    const lanes = await this.buildLanes(
      ctx,
      actorUserId,
      visibleTeamIds,
      inRange,
      query,
    );

    return {
      timezone: timeZone,
      date,
      range,
      from: window.start.toISOString(),
      to: window.end.toISOString(),
      hours: { start: 6, end: 20 },
      defaultWindowMinutes: DEFAULT_JOB_WINDOW_MINUTES,
      canMutate: canEditSchedule(ctx.role),
      lanes,
      unassigned: unassigned.map((job) => serializeScheduleJob(job)),
    };
  }

  async getJob(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const job = await this.prisma.job.findFirst({
      where: {
        AND: [
          jobVisibilityWhere(ctx, actorUserId, visibleTeamIds),
          { id: jobId },
        ],
      },
      include: {
        ...JOB_INCLUDE,
        client: { select: { id: true, name: true, accountCode: true } },
        site: {
          select: {
            id: true,
            name: true,
            city: true,
            region: true,
            addressLine1: true,
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return {
      ...serializeScheduleJob(job),
      scope: job.scope,
      jobType: job.jobType,
      client: {
        id: job.client.id,
        name: job.client.name,
        clientCode: job.client.accountCode,
      },
      site: {
        id: job.site.id,
        name: job.site.name,
        city: job.site.city,
        stateRegion: job.site.region,
        addressLine1: job.site.addressLine1,
      },
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  async schedule(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: ScheduleJobDto,
  ) {
    if (!canEditSchedule(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const existing = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const nextStart =
      dto.scheduledStart === undefined
        ? existing.scheduledStart
        : dto.scheduledStart
          ? new Date(dto.scheduledStart)
          : null;
    const nextFinish =
      dto.expectedFinish === undefined
        ? existing.expectedFinish
        : dto.expectedFinish
          ? new Date(dto.expectedFinish)
          : null;
    if (nextStart && nextFinish && nextFinish.getTime() <= nextStart.getTime()) {
      throw new BadRequestException('expectedFinish must be after scheduledStart');
    }

    const nextTeamId =
      dto.teamId === undefined ? existing.teamId : dto.teamId;
    const nextSupervisorId =
      dto.supervisorUserId === undefined
        ? existing.supervisorUserId
        : dto.supervisorUserId;
    if (nextTeamId) {
      await this.requireOrgTeam(ctx.organizationId, nextTeamId);
    }
    if (nextSupervisorId) {
      await this.requireActiveMember(ctx.organizationId, nextSupervisorId);
    }

    const currentTechIds = existing.assignments.map((row) => row.userId);
    const nextTechIds =
      dto.technicianUserIds === undefined
        ? currentTechIds
        : [...new Set(dto.technicianUserIds)];
    for (const userId of nextTechIds) {
      await this.requireActiveMember(ctx.organizationId, userId);
      if (ctx.role === OrganizationRole.SUPERVISOR) {
        await this.assertSupervisorMayAssign(ctx, actorUserId, userId);
      }
    }

    const nextWindow = jobWindow(nextStart, nextFinish);
    if (nextWindow && nextTechIds.length > 0 && !dto.confirmOverlap) {
      const conflicts = await this.findOverlaps(
        ctx.organizationId,
        existing.id,
        nextTechIds,
        nextWindow,
      );
      if (conflicts.length > 0) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            error: 'SCHEDULE_CONFLICT',
            message:
              'A technician is already assigned to an overlapping job. Confirm to schedule anyway.',
            conflicts,
          },
          HttpStatus.CONFLICT,
        );
      }
    }

    const hadStart = Boolean(existing.scheduledStart);
    const timesChanged =
      existing.scheduledStart?.getTime() !== nextStart?.getTime() ||
      existing.expectedFinish?.getTime() !== nextFinish?.getTime();
    const assignmentChanged =
      existing.teamId !== nextTeamId ||
      existing.supervisorUserId !== nextSupervisorId ||
      !sameIds(currentTechIds, nextTechIds);
    const hadAssignment =
      Boolean(existing.teamId) ||
      Boolean(existing.supervisorUserId) ||
      currentTechIds.length > 0;

    const nextStatus =
      existing.status === JobStatus.DRAFT && nextStart
        ? JobStatus.SCHEDULED
        : existing.status;
    if (nextStatus !== existing.status) {
      this.workflow.assertTransition(existing.status, nextStatus);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const cas = await tx.job.updateMany({
        where: {
          id: existing.id,
          organizationId: ctx.organizationId,
          status: existing.status,
        },
        data: {
          scheduledStart: nextStart,
          expectedFinish: nextFinish,
          teamId: nextTeamId,
          supervisorUserId: nextSupervisorId,
          status: nextStatus,
        },
      });
      if (cas.count !== 1) {
        throw new ConflictException('Job status changed concurrently');
      }
      const job = await tx.job.findFirstOrThrow({
        where: { id: existing.id, organizationId: ctx.organizationId },
        include: JOB_INCLUDE,
      });

      if (dto.technicianUserIds !== undefined) {
        await tx.jobAssignment.deleteMany({
          where: {
            organizationId: ctx.organizationId,
            jobId: existing.id,
            userId: { notIn: nextTechIds },
          },
        });
        for (const userId of nextTechIds) {
          await tx.jobAssignment.upsert({
            where: { jobId_userId: { jobId: existing.id, userId } },
            update: {},
            create: {
              organizationId: ctx.organizationId,
              jobId: existing.id,
              userId,
              role: JobAssignmentRole.TECHNICIAN,
            },
          });
        }
      }

      const fresh = await tx.job.findFirstOrThrow({
        where: { id: existing.id },
        include: JOB_INCLUDE,
      });

      if (timesChanged) {
        await this.audit.record(
          {
            action: hadStart ? AUDIT_JOB_RESCHEDULED : AUDIT_JOB_SCHEDULED,
            entityType: 'Job',
            entityId: job.id,
            organizationId: ctx.organizationId,
            actorUserId,
            oldValues: {
              scheduledStart: existing.scheduledStart,
              expectedFinish: existing.expectedFinish,
            },
            newValues: {
              scheduledStart: nextStart,
              expectedFinish: nextFinish,
            },
          },
          tx,
        );
      }
      if (assignmentChanged) {
        await this.audit.record(
          {
            action: hadAssignment ? AUDIT_JOB_REASSIGNED : AUDIT_JOB_ASSIGNED,
            entityType: 'Job',
            entityId: job.id,
            organizationId: ctx.organizationId,
            actorUserId,
            oldValues: {
              teamId: existing.teamId,
              supervisorUserId: existing.supervisorUserId,
              technicianUserIds: currentTechIds,
            },
            newValues: {
              teamId: nextTeamId,
              supervisorUserId: nextSupervisorId,
              technicianUserIds: nextTechIds,
            },
          },
          tx,
        );
      }

      const newlyAssignedUserIds = nextTechIds.filter(
        (userId) => !currentTechIds.includes(userId),
      );
      const rescheduleUserIds =
        timesChanged && hadStart
          ? [...new Set([...nextTechIds, nextSupervisorId].filter(Boolean))]
          : [];
      await this.jobEvents.emitScheduleChanges(
        {
          organizationId: ctx.organizationId,
          organizationName: ctx.name,
          orgSlug: ctx.slug,
          jobId: existing.id,
          jobNumber: fresh.jobNumber,
          jobTitle: fresh.title,
          actorUserId,
          newlyAssignedUserIds,
          rescheduleUserIds: rescheduleUserIds as string[],
          scheduledStart: nextStart,
          expectedFinish: nextFinish,
          timezone: ctx.timezone,
        },
        tx,
      );

      return {
        job: fresh,
        newlyAssignedUserIds,
        scheduledStart: nextStart,
        expectedFinish: nextFinish,
      };
    });

    await this.jobEvents.emailJobAssigned({
      organizationId: ctx.organizationId,
      organizationName: ctx.name,
      orgSlug: ctx.slug,
      jobId: updated.job.id,
      jobNumber: updated.job.jobNumber,
      jobTitle: updated.job.title,
      actorUserId,
      newlyAssignedUserIds: updated.newlyAssignedUserIds,
      rescheduleUserIds: [],
      scheduledStart: updated.scheduledStart,
      expectedFinish: updated.expectedFinish,
      timezone: ctx.timezone,
    });

    return serializeScheduleJob(updated.job);
  }

  private async buildLanes(
    ctx: OrganizationContext,
    actorUserId: string,
    visibleTeamIds: string[],
    jobs: Array<Prisma.JobGetPayload<{ include: typeof JOB_INCLUDE }>>,
    query: ScheduleQueryDto,
  ) {
    const assignedUserIds = [
      ...new Set(
        jobs.flatMap((job) => job.assignments.map((assignment) => assignment.userId)),
      ),
    ];
    const technicianWhere: Prisma.OrganizationMemberWhereInput = {
      organizationId: ctx.organizationId,
      status: MembershipStatus.ACTIVE,
      AND: [
        canManageSchedule(ctx.role)
          ? {
              OR: [
                {
                  role: {
                    in: [OrganizationRole.TECHNICIAN, OrganizationRole.SUPERVISOR],
                  },
                },
                assignedUserIds.length ? { userId: { in: assignedUserIds } } : { userId: actorUserId },
              ],
            }
          : ctx.role === OrganizationRole.SUPERVISOR
            ? {
                OR: [
                  { userId: actorUserId },
                  visibleTeamIds.length
                    ? {
                        user: {
                          teamMemberships: {
                            some: { teamId: { in: visibleTeamIds } },
                          },
                        },
                      }
                    : { userId: actorUserId },
                ],
              }
            : { userId: actorUserId },
        query.technicianId ? { userId: query.technicianId } : {},
      ],
    };

    const members = await this.prisma.organizationMember.findMany({
      where: technicianWhere,
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });

    const teamWhere: Prisma.TeamWhereInput = {
      organizationId: ctx.organizationId,
      status: EntityStatus.ACTIVE,
      ...(canManageSchedule(ctx.role)
        ? {}
        : { id: { in: visibleTeamIds.length ? visibleTeamIds : [''] } }),
      ...(query.teamId ? { id: query.teamId } : {}),
    };
    const teams =
      ctx.role === OrganizationRole.TECHNICIAN
        ? []
        : await this.prisma.team.findMany({
            where: teamWhere,
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          });

    const technicianLanes = members.map((member) => ({
      id: `tech:${member.userId}`,
      kind: 'TECHNICIAN' as const,
      label: member.user.fullName,
      userId: member.userId,
      teamId: null as string | null,
      jobs: jobs
        .filter((job) =>
          job.assignments.some((assignment) => assignment.userId === member.userId),
        )
        .map((job) => serializeScheduleJob(job)),
    }));

    const teamLanes = teams.map((team) => ({
      id: `team:${team.id}`,
      kind: 'TEAM' as const,
      label: team.name,
      userId: null as string | null,
      teamId: team.id,
      jobs: jobs
        .filter(
          (job) => job.teamId === team.id && job.assignments.length === 0,
        )
        .map((job) => serializeScheduleJob(job)),
    }));

    return [...technicianLanes, ...teamLanes];
  }

  private async findOverlaps(
    organizationId: string,
    jobId: string,
    technicianUserIds: string[],
    window: { start: Date; end: Date },
  ) {
    const candidates = await this.prisma.job.findMany({
      where: {
        organizationId,
        id: { not: jobId },
        status: { notIn: TERMINAL_JOB_STATUSES },
        assignments: { some: { userId: { in: technicianUserIds } } },
        scheduledStart: { not: null },
      },
      include: {
        assignments: {
          where: { userId: { in: technicianUserIds } },
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });

    const conflicts: Array<{
      jobId: string;
      jobNumber: string;
      userId: string;
      fullName: string;
      scheduledStart: string;
      expectedFinish: string | null;
    }> = [];
    for (const candidate of candidates) {
      const span = jobWindow(candidate.scheduledStart, candidate.expectedFinish);
      if (!span || !windowsOverlap(window, span)) continue;
      for (const assignment of candidate.assignments) {
        conflicts.push({
          jobId: candidate.id,
          jobNumber: candidate.jobNumber,
          userId: assignment.user.id,
          fullName: assignment.user.fullName,
          scheduledStart: candidate.scheduledStart!.toISOString(),
          expectedFinish: candidate.expectedFinish?.toISOString() ?? null,
        });
      }
    }
    return conflicts;
  }

  private async requireVisibleJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const job = await this.prisma.job.findFirst({
      where: {
        AND: [
          jobVisibilityWhere(ctx, actorUserId, visibleTeamIds),
          { id: jobId },
        ],
      },
      include: { assignments: true },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return job;
  }

  private async requireOrgTeam(organizationId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: withTenant(organizationId, { id: teamId }),
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
      throw new BadRequestException('Assignee must be an active organization member');
    }
    return member;
  }

  private async assertSupervisorMayAssign(
    ctx: OrganizationContext,
    actorUserId: string,
    userId: string,
  ) {
    if (userId === actorUserId) return;
    const teamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    if (teamIds.length === 0) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const onTeam = await this.prisma.teamMember.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId,
        teamId: { in: teamIds },
      },
    });
    if (!onTeam) {
      throw new ForbiddenException('Supervisors can only assign people on their teams');
    }
  }
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}
