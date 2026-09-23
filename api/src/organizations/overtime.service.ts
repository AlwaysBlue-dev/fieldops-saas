import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_OVERTIME_APPROVED,
  AUDIT_OVERTIME_CANCELLED,
  AUDIT_OVERTIME_REJECTED,
  AUDIT_OVERTIME_REQUESTED,
} from '../common/constants.js';
import { addCalendarDays, zonedLocalToUtc } from '../common/timezone.js';
import {
  ApprovalStatus,
  ApprovalType,
  MembershipStatus,
  OrganizationRole,
  OvertimeAuthorizationStatus,
  Prisma,
  TimeEntryStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { canManageCrew } from './crew-access.js';
import { jobVisibilityWhere } from './job-visibility.js';
import { TeamsService } from './teams.service.js';
import { canApproveTimesheets } from './timesheet-access.js';
import { durationMinutesFromRange } from './timesheet-validation.js';
import { OvertimeNotificationHook } from './overtime-events.js';
import { OvertimeValidationService } from './overtime-validation.service.js';
import { assertNotSelfApproval } from './approval-access.js';
import { ApprovalRecordsService } from './approval-records.service.js';
import type {
  CreateOvertimeAuthorizationDto,
  DecideOvertimeDto,
  ListOvertimeQueryDto,
} from './dto/overtime-authorization.dto.js';

const include = {
  technician: { select: { id: true, fullName: true } },
  requestedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  job: { select: { id: true, jobNumber: true, title: true, supervisorUserId: true } },
} satisfies Prisma.OvertimeAuthorizationInclude;

type AuthRow = Prisma.OvertimeAuthorizationGetPayload<{ include: typeof include }>;

@Injectable()
export class OvertimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly teams: TeamsService,
    private readonly hook: OvertimeNotificationHook,
    private readonly overtimeValidation: OvertimeValidationService,
    private readonly approvals: ApprovalRecordsService,
    private readonly mail: MailService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ListOvertimeQueryDto,
  ) {
    const visible = await this.visibleTechnicianUserIds(ctx, actorUserId);
    const userId = query.userId ?? (canApproveTimesheets(ctx.role) ? undefined : actorUserId);
    if (userId && !visible.includes(userId)) {
      throw new NotFoundException();
    }
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.OvertimeAuthorizationWhereInput = {
      organizationId: ctx.organizationId,
      userId: userId ? userId : { in: visible },
      ...(query.status
        ? { status: query.status as OvertimeAuthorizationStatus }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.overtimeAuthorization.count({ where }),
      this.prisma.overtimeAuthorization.findMany({
        where,
        include,
        orderBy: [{ requestedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const used = await this.usedByAuthorization(
      ctx.organizationId,
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) => this.serialize(row, used.get(row.id) ?? 0)),
      total,
      page,
      pageSize,
      canDecide: canApproveTimesheets(ctx.role),
      canRequest: await this.canRequest(ctx, actorUserId),
    };
  }

  async get(
    ctx: OrganizationContext,
    actorUserId: string,
    authorizationId: string,
  ) {
    const row = await this.requireVisible(ctx, actorUserId, authorizationId);
    const used = await this.overtimeValidation.usedMinutes(
      ctx.organizationId,
      row.id,
    );
    return this.serialize(row, used);
  }

  async create(
    ctx: OrganizationContext,
    actorUserId: string,
    dto: CreateOvertimeAuthorizationDto,
  ) {
    const settings = await this.requireSettings(ctx.organizationId);
    const subjectUserId = dto.userId ?? actorUserId;
    await this.assertCanRequestFor(ctx, actorUserId, subjectUserId, settings.allowOvertimeRequests);
    const job = await this.requireVisibleJob(ctx, actorUserId, dto.jobId);
    const range = this.rangeFromDto(
      dto.workDate,
      dto.startTime,
      dto.endTime,
      settings.timeZone,
    );
    const windowMinutes = durationMinutesFromRange(range.startAt, range.endAt);
    if (windowMinutes <= 0) {
      throw new BadRequestException('Authorized finish must be after start');
    }
    if (dto.maxMinutes > windowMinutes) {
      throw new BadRequestException(
        'Maximum overtime minutes cannot exceed the authorized window',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.overtimeAuthorization.create({
        data: {
          organizationId: ctx.organizationId,
          userId: subjectUserId,
          jobId: job.id,
          workDate: new Date(`${dto.workDate}T00:00:00.000Z`),
          authorizedStart: range.startAt,
          authorizedEnd: range.endAt,
          maxMinutes: dto.maxMinutes,
          reason: dto.reason.trim(),
          status: OvertimeAuthorizationStatus.PENDING,
          requestedByUserId: actorUserId,
          requestedAt: this.clock.now(),
        },
        include,
      });
      await this.audit.record(
        {
          action: AUDIT_OVERTIME_REQUESTED,
          entityType: 'OvertimeAuthorization',
          entityId: row.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: {
            userId: subjectUserId,
            jobId: job.id,
            workDate: dto.workDate,
            maxMinutes: dto.maxMinutes,
            status: OvertimeAuthorizationStatus.PENDING,
          },
        },
        tx,
      );
      await this.approvals.ensurePending(
        {
          organizationId: ctx.organizationId,
          type: ApprovalType.OVERTIME,
          subjectType: 'OvertimeAuthorization',
          subjectId: row.id,
          requestedByUserId: actorUserId,
          assignedApproverUserId: job.supervisorUserId,
          assignedRole: OrganizationRole.SUPERVISOR,
        },
        tx,
      );
      await this.hook.emit(
        {
          type: 'OVERTIME_REQUESTED',
          organizationId: ctx.organizationId,
          authorizationId: row.id,
          technicianUserId: subjectUserId,
          actorUserId,
          recipientUserIds: await this.decisionRecipientIds(
            ctx,
            job.supervisorUserId,
          ),
          title: 'Overtime requested',
          body: `${row.technician.fullName} requested overtime on ${row.job.jobNumber}.`,
          payload: {
            jobId: job.id,
            workDate: dto.workDate,
            maxMinutes: dto.maxMinutes,
          },
        },
        tx,
      );
      return row;
    });
    return this.serialize(created, 0);
  }

  async decide(
    ctx: OrganizationContext,
    actorUserId: string,
    authorizationId: string,
    dto: DecideOvertimeDto,
  ) {
    if (!canApproveTimesheets(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const existing = await this.requireVisible(ctx, actorUserId, authorizationId);
    assertNotSelfApproval(actorUserId, [existing.userId]);
    if (existing.status !== OvertimeAuthorizationStatus.PENDING) {
      throw new BadRequestException('This overtime request is not pending');
    }
    if (dto.decision === 'REJECTED' && !dto.comment?.trim()) {
      throw new BadRequestException('A rejection comment is required');
    }
    const next =
      dto.decision === 'APPROVED'
        ? OvertimeAuthorizationStatus.APPROVED
        : OvertimeAuthorizationStatus.REJECTED;
    const action =
      next === OvertimeAuthorizationStatus.APPROVED
        ? AUDIT_OVERTIME_APPROVED
        : AUDIT_OVERTIME_REJECTED;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.overtimeAuthorization.update({
        where: { id: existing.id },
        data: {
          status: next,
          decidedByUserId: actorUserId,
          decidedAt: this.clock.now(),
          decisionComment: dto.comment?.trim() || null,
        },
        include,
      });
      await this.approvals.markDecided(
        {
          organizationId: ctx.organizationId,
          type: ApprovalType.OVERTIME,
          subjectId: row.id,
          status:
            next === OvertimeAuthorizationStatus.APPROVED
              ? ApprovalStatus.APPROVED
              : ApprovalStatus.REJECTED,
          decision: dto.decision,
          comment: dto.comment,
          decidedByUserId: actorUserId,
          decidedAt: this.clock.now(),
        },
        tx,
      );
      await this.audit.record(
        {
          action,
          entityType: 'OvertimeAuthorization',
          entityId: row.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: existing.status },
          newValues: { status: next, comment: dto.comment?.trim() ?? null },
        },
        tx,
      );
      await this.hook.emit(
        {
          type: next === OvertimeAuthorizationStatus.APPROVED
            ? 'OVERTIME_APPROVED'
            : 'OVERTIME_REJECTED',
          organizationId: ctx.organizationId,
          authorizationId: row.id,
          technicianUserId: row.userId,
          actorUserId,
          recipientUserIds: [row.userId, row.requestedByUserId],
          title:
            next === OvertimeAuthorizationStatus.APPROVED
              ? 'Overtime approved'
              : 'Overtime rejected',
          body:
            next === OvertimeAuthorizationStatus.APPROVED
              ? `Overtime was approved for ${row.job.jobNumber}.`
              : `Overtime was rejected for ${row.job.jobNumber}.`,
          payload: { status: next, comment: dto.comment?.trim() ?? null },
        },
        tx,
      );
      return row;
    });
    const tech = await this.prisma.user.findUnique({
      where: { id: updated.userId },
      select: { email: true, fullName: true },
    });
    if (tech) {
      await this.mail.sendOvertimeDecision({
        to: tech.email,
        recipientName: tech.fullName,
        organizationName: ctx.name,
        orgSlug: ctx.slug,
        decision: dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        jobNumber: updated.job.jobNumber,
        comment: dto.comment?.trim() ?? null,
      });
    }
    const used = await this.overtimeValidation.usedMinutes(
      ctx.organizationId,
      updated.id,
    );
    return this.serialize(updated, used);
  }

  async cancel(
    ctx: OrganizationContext,
    actorUserId: string,
    authorizationId: string,
  ) {
    const existing = await this.requireVisible(ctx, actorUserId, authorizationId);
    if (existing.status !== OvertimeAuthorizationStatus.PENDING) {
      throw new BadRequestException('Only pending overtime can be cancelled');
    }
    const canCancel =
      existing.requestedByUserId === actorUserId ||
      existing.userId === actorUserId ||
      canApproveTimesheets(ctx.role);
    if (!canCancel) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.overtimeAuthorization.update({
        where: { id: existing.id },
        data: {
          status: OvertimeAuthorizationStatus.CANCELLED,
          decidedByUserId: actorUserId,
          decidedAt: this.clock.now(),
        },
        include,
      });
      await this.audit.record(
        {
          action: AUDIT_OVERTIME_CANCELLED,
          entityType: 'OvertimeAuthorization',
          entityId: row.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: existing.status },
          newValues: { status: OvertimeAuthorizationStatus.CANCELLED },
        },
        tx,
      );
      await this.approvals.markCancelled(
        {
          organizationId: ctx.organizationId,
          type: ApprovalType.OVERTIME,
          subjectId: row.id,
          decidedByUserId: actorUserId,
          decidedAt: this.clock.now(),
        },
        tx,
      );
      await this.hook.emit(
        {
          type: 'OVERTIME_CANCELLED',
          organizationId: ctx.organizationId,
          authorizationId: row.id,
          technicianUserId: row.userId,
          actorUserId,
          recipientUserIds: [row.userId, row.requestedByUserId],
          title: 'Overtime cancelled',
          body: `Overtime was cancelled for ${row.job.jobNumber}.`,
          payload: { status: OvertimeAuthorizationStatus.CANCELLED },
        },
        tx,
      );
      return row;
    });
    return this.serialize(updated, 0);
  }

  private serialize(row: AuthRow, usedMinutes: number) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      technician: { userId: row.technician.id, fullName: row.technician.fullName },
      job: {
        id: row.job.id,
        jobNumber: row.job.jobNumber,
        title: row.job.title,
      },
      workDate: row.workDate.toISOString().slice(0, 10),
      authorizedStart: row.authorizedStart.toISOString(),
      authorizedEnd: row.authorizedEnd.toISOString(),
      maxMinutes: row.maxMinutes,
      remainingMinutes: Math.max(0, row.maxMinutes - usedMinutes),
      usedMinutes,
      reason: row.reason,
      status: row.status,
      requestedBy: {
        userId: row.requestedBy.id,
        fullName: row.requestedBy.fullName,
      },
      requestedAt: row.requestedAt.toISOString(),
      decidedBy: row.decidedBy
        ? { userId: row.decidedBy.id, fullName: row.decidedBy.fullName }
        : null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionComment: row.decisionComment,
    };
  }

  private rangeFromDto(
    workDate: string,
    startTime: string,
    endTime: string,
    timeZone: string,
  ) {
    const start = startTime.length === 5 ? `${startTime}:00` : startTime;
    const finish = endTime.length === 5 ? `${endTime}:00` : endTime;
    const startAt = zonedLocalToUtc(workDate, start, timeZone);
    let endAt = zonedLocalToUtc(workDate, finish, timeZone);
    if (endAt.getTime() <= startAt.getTime()) {
      endAt = zonedLocalToUtc(addCalendarDays(workDate, 1), finish, timeZone);
    }
    return { startAt, endAt };
  }

  private async requireSettings(organizationId: string) {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    return {
      timeZone: settings?.timezone ?? 'UTC',
      allowOvertimeRequests: settings?.allowOvertimeRequests ?? true,
    };
  }

  private async canRequest(ctx: OrganizationContext, actorUserId: string) {
    if (canApproveTimesheets(ctx.role)) return true;
    const settings = await this.requireSettings(ctx.organizationId);
    return settings.allowOvertimeRequests && actorUserId.length > 0;
  }

  private async assertCanRequestFor(
    ctx: OrganizationContext,
    actorUserId: string,
    subjectUserId: string,
    allowOvertimeRequests: boolean,
  ) {
    if (subjectUserId === actorUserId) {
      if (canApproveTimesheets(ctx.role) || allowOvertimeRequests) return;
      throw new ForbiddenException('Overtime requests are not enabled');
    }
    const visible = await this.visibleTechnicianUserIds(ctx, actorUserId);
    if (!visible.includes(subjectUserId) || !canApproveTimesheets(ctx.role)) {
      throw new NotFoundException();
    }
  }

  private async visibleTechnicianUserIds(
    ctx: OrganizationContext,
    actorUserId: string,
  ) {
    if (canManageCrew(ctx.role)) {
      const members = await this.prisma.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: MembershipStatus.ACTIVE,
        },
        select: { userId: true },
      });
      return members.map((row) => row.userId);
    }
    if (ctx.role === OrganizationRole.SUPERVISOR) {
      const teamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
      if (teamIds.length === 0) return [actorUserId];
      const members = await this.prisma.teamMember.findMany({
        where: { organizationId: ctx.organizationId, teamId: { in: teamIds } },
        select: { userId: true },
      });
      return [...new Set([actorUserId, ...members.map((row) => row.userId)])];
    }
    return [actorUserId];
  }

  private async requireVisible(
    ctx: OrganizationContext,
    actorUserId: string,
    authorizationId: string,
  ) {
    const row = await this.prisma.overtimeAuthorization.findFirst({
      where: { id: authorizationId, organizationId: ctx.organizationId },
      include,
    });
    if (!row) {
      throw new NotFoundException();
    }
    const visible = await this.visibleTechnicianUserIds(ctx, actorUserId);
    if (!visible.includes(row.userId)) {
      throw new NotFoundException();
    }
    return row;
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
      select: { id: true, supervisorUserId: true },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return job;
  }

  private async decisionRecipientIds(
    ctx: OrganizationContext,
    supervisorUserId: string | null,
  ) {
    if (supervisorUserId) return [supervisorUserId];
    const managers = await this.prisma.organizationMember.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: MembershipStatus.ACTIVE,
        role: {
          in: [
            OrganizationRole.OWNER,
            OrganizationRole.ADMIN,
            OrganizationRole.OPERATIONS_MANAGER,
          ],
        },
      },
      select: { userId: true },
      take: 5,
    });
    return managers.map((row) => row.userId);
  }

  private async usedByAuthorization(
    organizationId: string,
    authorizationIds: string[],
  ) {
    const used = new Map<string, number>();
    if (authorizationIds.length === 0) return used;
    const rows = await this.prisma.timeEntry.groupBy({
      by: ['overtimeAuthorizationId'],
      where: {
        organizationId,
        overtimeAuthorizationId: { in: authorizationIds },
        status: {
          in: [
            TimeEntryStatus.DRAFT,
            TimeEntryStatus.SUBMITTED,
            TimeEntryStatus.PENDING,
            TimeEntryStatus.APPROVED,
            TimeEntryStatus.RETURNED,
          ],
        },
      },
      _sum: { durationMinutes: true },
    });
    for (const row of rows) {
      if (row.overtimeAuthorizationId) {
        used.set(row.overtimeAuthorizationId, row._sum.durationMinutes ?? 0);
      }
    }
    return used;
  }
}
