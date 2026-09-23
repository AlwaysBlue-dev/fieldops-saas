import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_JOB_CANCELLED,
  AUDIT_JOB_COMPLETED,
  AUDIT_JOB_CREATED,
  AUDIT_JOB_DISPATCHED,
  AUDIT_JOB_RETURNED,
  AUDIT_JOB_STARTED,
  AUDIT_JOB_SUBMITTED,
  AUDIT_JOB_UPDATED,
} from '../common/constants.js';
import {
  formatYmdInZone,
  isYmd,
  zonedDayRange,
} from '../common/timezone.js';
import {
  DEFAULT_GPS_REVIEW_DISTANCE_METERS,
  locationEvidence,
  toFiniteNumber,
} from '../common/geo.js';
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
import { Inject } from '@nestjs/common';
import { withTenant } from '../tenancy/tenant-scope.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { emptyToNull } from './dto/text.util.js';
import type { CancelJobDto, ReturnJobDto } from './dto/job-action.dto.js';
import type { CreateJobDto } from './dto/create-job.dto.js';
import type { ListJobsQueryDto } from './dto/list-jobs-query.dto.js';
import type { UpdateJobDto } from './dto/update-job.dto.js';
import { allocateJobNumber } from './job-numbering.js';
import {
  jobVisibilityWhere,
  TERMINAL_JOB_STATUSES,
} from './job-visibility.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { serializeJobSummary } from './jobs-serializer.js';
import { TeamsService } from './teams.service.js';

const LIST_INCLUDE = {
  client: { select: { id: true, name: true } },
  site: { select: { id: true, name: true, city: true } },
  team: { select: { id: true, name: true } },
  supervisor: { select: { id: true, fullName: true } },
  assignments: {
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { assignedAt: 'asc' as const },
  },
} satisfies Prisma.JobInclude;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly teams: TeamsService,
    private readonly workflow: JobWorkflowService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ListJobsQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sort = query.sort ?? 'scheduledStart';
    const order = query.order ?? 'asc';
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const visibility = jobVisibilityWhere(ctx, actorUserId, visibleTeamIds);
    const timeZone = ctx.timezone;
    const today = formatYmdInZone(this.clock.now(), timeZone);
    const preset = query.preset;
    const date =
      query.date && isYmd(query.date)
        ? query.date
        : preset === 'today'
          ? today
          : undefined;
    const search = query.search?.trim();

    const where: Prisma.JobWhereInput = {
      AND: [
        visibility,
        query.status
          ? { status: query.status }
          : preset === 'open'
            ? { status: { notIn: TERMINAL_JOB_STATUSES } }
            : preset === 'approval'
              ? { status: JobStatus.PENDING_APPROVAL }
              : {},
        query.priority ? { priority: query.priority } : {},
        query.clientId ? { clientId: query.clientId } : {},
        query.teamId ? { teamId: query.teamId } : {},
        query.technicianId
          ? { assignments: { some: { userId: query.technicianId } } }
          : {},
        query.unassigned || preset === 'unassigned'
          ? { teamId: null, assignments: { none: {} } }
          : {},
        date
          ? {
              scheduledStart: {
                gte: zonedDayRange(date, timeZone).start,
                lt: zonedDayRange(date, timeZone).end,
              },
            }
          : {},
        search
          ? {
              OR: [
                { jobNumber: { contains: search, mode: 'insensitive' } },
                { title: { contains: search, mode: 'insensitive' } },
                { client: { name: { contains: search, mode: 'insensitive' } } },
                { site: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => serializeJobSummary(row)),
      total,
      page,
      pageSize,
    };
  }

  async get(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    const activity = await this.prisma.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: 'Job',
        entityId: job.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        createdAt: true,
        newValues: true,
        oldValues: true,
      },
    });
    const actorIds = [
      ...new Set(activity.map((row) => row.actorUserId).filter(Boolean)),
    ] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const actorNames = new Map(actors.map((row) => [row.id, row.fullName]));
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { gpsReviewDistanceMeters: true },
    });
    const reviewDistance =
      settings?.gpsReviewDistanceMeters ?? DEFAULT_GPS_REVIEW_DISTANCE_METERS;
    const sitePoint = {
      latitude: toFiniteNumber(job.site.latitude),
      longitude: toFiniteNumber(job.site.longitude),
    };

    return {
      ...serializeJobSummary(job),
      scope: job.scope,
      internalNotes: job.internalNotes,
      workOrderNumber: job.workOrderNumber,
      jobType: job.jobType,
      clientRepName: job.clientRepName,
      clientRepTitle: job.clientRepTitle,
      clientRepPhone: job.clientRepPhone,
      clientRepEmail: job.clientRepEmail,
      requireRiskAssessment: job.requireRiskAssessment,
      requirePermit: job.requirePermit,
      requireLoto: job.requireLoto,
      requireClientSignOff: job.requireClientSignOff,
      cancelReason: job.cancelReason,
      completedAt: job.completedAt?.toISOString() ?? null,
      cancelledAt: job.cancelledAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      client: {
        id: job.client.id,
        name: job.client.name,
        clientCode: job.client.accountCode,
        email: job.client.email,
        phone: job.client.phone,
      },
      site: {
        id: job.site.id,
        name: job.site.name,
        city: job.site.city,
        stateRegion: job.site.region,
        addressLine1: job.site.addressLine1,
        latitude: job.site.latitude?.toString() ?? null,
        longitude: job.site.longitude?.toString() ?? null,
      },
      allowedTransitions: this.workflow.allowedTargets(job.status),
      permissions: {
        canEdit: this.workflow.canEditFields(ctx.role, job.status),
        canDispatch: this.workflow.canDispatch(ctx.role),
        canCancel: this.workflow.canCancel(ctx.role),
        canApprove: this.workflow.canApprove(ctx.role),
        canFieldAdvance: this.workflow.canFieldAdvance(ctx.role, assigned),
      },
      workLogs: job.workLogs.map((row) => ({
        id: row.id,
        body: row.body,
        loggedAt: row.loggedAt.toISOString(),
        author: { userId: row.author.id, fullName: row.author.fullName },
      })),
      materials: job.materials.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity.toString(),
        unit: row.unit,
        notes: row.notes,
      })),
      files: job.files.map((row) => ({
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes.toString(),
        type: row.type,
        createdAt: row.createdAt.toISOString(),
      })),
      signatures: job.signatures.map((row) => ({
        id: row.id,
        signerName: row.signerName,
        signerTitle: row.signerTitle,
        signedAt: row.signedAt.toISOString(),
      })),
      clockSessions: job.clockSessions.map((row) => ({
        id: row.id,
        status: row.status,
        clockInAt: row.clockInAt.toISOString(),
        clockOutAt: row.clockOutAt?.toISOString() ?? null,
        technician: {
          userId: row.technician.id,
          fullName: row.technician.fullName,
        },
        clockInEvidence: locationEvidence({
          latitude: toFiniteNumber(row.clockInLatitude),
          longitude: toFiniteNumber(row.clockInLongitude),
          accuracyMeters: toFiniteNumber(row.clockInAccuracyMeters),
          siteLatitude: sitePoint.latitude,
          siteLongitude: sitePoint.longitude,
          reviewDistanceMeters: reviewDistance,
        }),
        clockOutEvidence: row.clockOutAt
          ? locationEvidence({
              latitude: toFiniteNumber(row.clockOutLatitude),
              longitude: toFiniteNumber(row.clockOutLongitude),
              accuracyMeters: toFiniteNumber(row.clockOutAccuracyMeters),
              siteLatitude: sitePoint.latitude,
              siteLongitude: sitePoint.longitude,
              reviewDistanceMeters: reviewDistance,
            })
          : null,
      })),
      timeEntries: job.timeEntries.map((row) => ({
        id: row.id,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        source: row.source,
        status: row.status,
        user: { userId: row.user.id, fullName: row.user.fullName },
      })),
      activity: activity.map((row) => ({
        id: row.id,
        action: row.action,
        actorName: row.actorUserId
          ? (actorNames.get(row.actorUserId) ?? null)
          : null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async create(ctx: OrganizationContext, actorUserId: string, dto: CreateJobDto) {
    if (!this.workflow.canCreate(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const site = await this.requireClientSite(
      ctx.organizationId,
      dto.clientId,
      dto.siteId,
    );
    if (dto.teamId) {
      await this.requireOrgTeam(ctx.organizationId, dto.teamId);
    }
    if (dto.supervisorUserId) {
      await this.requireActiveMember(ctx.organizationId, dto.supervisorUserId);
    }
    const techIds = [...new Set(dto.technicianUserIds ?? [])];
    for (const userId of techIds) {
      await this.requireActiveMember(ctx.organizationId, userId);
      if (ctx.role === OrganizationRole.SUPERVISOR) {
        await this.assertSupervisorMayAssign(ctx, actorUserId, userId);
      }
    }
    const start = dto.scheduledStart ? new Date(dto.scheduledStart) : null;
    const finish = dto.expectedFinish ? new Date(dto.expectedFinish) : null;
    if (start && finish && finish.getTime() <= start.getTime()) {
      throw new BadRequestException('expectedFinish must be after scheduledStart');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const jobNumber = await allocateJobNumber(tx, ctx.organizationId);
      const job = await tx.job.create({
        data: {
          organizationId: ctx.organizationId,
          jobNumber,
          title: dto.title.trim(),
          clientId: site.clientId,
          siteId: site.id,
          jobType: dto.jobType,
          priority: dto.priority,
          scheduledStart: start,
          expectedFinish: finish,
          teamId: dto.teamId ?? null,
          supervisorUserId: dto.supervisorUserId ?? null,
          scope: emptyToNull(dto.scope),
          internalNotes: emptyToNull(dto.internalNotes),
          workOrderNumber: emptyToNull(dto.workOrderNumber),
          clientRepName: emptyToNull(dto.clientRepName),
          clientRepTitle: emptyToNull(dto.clientRepTitle),
          clientRepPhone: emptyToNull(dto.clientRepPhone),
          clientRepEmail: emptyToNull(dto.clientRepEmail),
          requireRiskAssessment: dto.requireRiskAssessment ?? false,
          requirePermit: dto.requirePermit ?? false,
          requireLoto: dto.requireLoto ?? false,
          requireClientSignOff: dto.requireClientSignOff ?? true,
          status: JobStatus.DRAFT,
        },
      });
      for (const userId of techIds) {
        await tx.jobAssignment.create({
          data: {
            organizationId: ctx.organizationId,
            jobId: job.id,
            userId,
            role: JobAssignmentRole.TECHNICIAN,
          },
        });
      }
      await this.audit.record(
        {
          action: AUDIT_JOB_CREATED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { jobNumber, title: job.title, status: job.status },
        },
        tx,
      );
      return job.id;
    });

    return this.get(ctx, actorUserId, created);
  }

  async update(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: UpdateJobDto,
  ) {
    const existing = await this.requireVisibleJob(ctx, actorUserId, jobId);
    if (!this.workflow.canEditFields(ctx.role, existing.status)) {
      throw new ForbiddenException('This job can no longer be edited');
    }
    if (
      existing.status !== JobStatus.DRAFT &&
      (dto.clientId || dto.siteId)
    ) {
      throw new BadRequestException('Client and site can only change on a draft');
    }
    const clientId = dto.clientId ?? existing.clientId;
    const siteId = dto.siteId ?? existing.siteId;
    if (dto.clientId || dto.siteId) {
      await this.requireClientSite(ctx.organizationId, clientId, siteId);
    }
    if (dto.teamId) {
      await this.requireOrgTeam(ctx.organizationId, dto.teamId);
    }
    if (dto.supervisorUserId) {
      await this.requireActiveMember(ctx.organizationId, dto.supervisorUserId);
    }
    const nextTechs =
      dto.technicianUserIds === undefined
        ? undefined
        : [...new Set(dto.technicianUserIds)];
    if (nextTechs) {
      for (const userId of nextTechs) {
        await this.requireActiveMember(ctx.organizationId, userId);
        if (ctx.role === OrganizationRole.SUPERVISOR) {
          await this.assertSupervisorMayAssign(ctx, actorUserId, userId);
        }
      }
    }
    const start =
      dto.scheduledStart === undefined
        ? existing.scheduledStart
        : dto.scheduledStart
          ? new Date(dto.scheduledStart)
          : null;
    const finish =
      dto.expectedFinish === undefined
        ? existing.expectedFinish
        : dto.expectedFinish
          ? new Date(dto.expectedFinish)
          : null;
    if (start && finish && finish.getTime() <= start.getTime()) {
      throw new BadRequestException('expectedFinish must be after scheduledStart');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: existing.id },
        data: {
          title: dto.title?.trim(),
          clientId: dto.clientId ? clientId : undefined,
          siteId: dto.siteId ? siteId : undefined,
          jobType: dto.jobType,
          priority: dto.priority,
          scheduledStart: dto.scheduledStart !== undefined ? start : undefined,
          expectedFinish: dto.expectedFinish !== undefined ? finish : undefined,
          teamId: dto.teamId === undefined ? undefined : dto.teamId,
          supervisorUserId:
            dto.supervisorUserId === undefined ? undefined : dto.supervisorUserId,
          scope: dto.scope === undefined ? undefined : emptyToNull(dto.scope),
          internalNotes:
            dto.internalNotes === undefined
              ? undefined
              : emptyToNull(dto.internalNotes),
          workOrderNumber:
            dto.workOrderNumber === undefined
              ? undefined
              : emptyToNull(dto.workOrderNumber),
          clientRepName:
            dto.clientRepName === undefined
              ? undefined
              : emptyToNull(dto.clientRepName),
          clientRepTitle:
            dto.clientRepTitle === undefined
              ? undefined
              : emptyToNull(dto.clientRepTitle),
          clientRepPhone:
            dto.clientRepPhone === undefined
              ? undefined
              : emptyToNull(dto.clientRepPhone),
          clientRepEmail:
            dto.clientRepEmail === undefined
              ? undefined
              : emptyToNull(dto.clientRepEmail),
          requireRiskAssessment: dto.requireRiskAssessment,
          requirePermit: dto.requirePermit,
          requireLoto: dto.requireLoto,
          requireClientSignOff: dto.requireClientSignOff,
        },
      });
      if (nextTechs) {
        await tx.jobAssignment.deleteMany({
          where: {
            organizationId: ctx.organizationId,
            jobId: existing.id,
            userId: { notIn: nextTechs },
          },
        });
        for (const userId of nextTechs) {
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
      await this.audit.record(
        {
          action: AUDIT_JOB_UPDATED,
          entityType: 'Job',
          entityId: existing.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { title: existing.title, status: existing.status },
          newValues: { title: dto.title ?? existing.title },
        },
        tx,
      );
    });

    return this.get(ctx, actorUserId, existing.id);
  }

  async dispatch(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    if (!this.workflow.canDispatch(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    this.workflow.assertTransition(job.status, JobStatus.DISPATCHED);
    if (!job.scheduledStart) {
      throw new BadRequestException('Schedule a start time before dispatch');
    }
    if (!job.teamId && job.assignments.length === 0) {
      throw new BadRequestException('Assign a team or technician before dispatch');
    }
    return this.applyStatus(ctx, actorUserId, job.id, JobStatus.DISPATCHED, AUDIT_JOB_DISPATCHED);
  }

  async start(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canFieldAdvance(ctx.role, assigned)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    this.workflow.assertTransition(job.status, JobStatus.IN_PROGRESS);
    return this.applyStatus(ctx, actorUserId, job.id, JobStatus.IN_PROGRESS, AUDIT_JOB_STARTED);
  }

  async submit(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canFieldAdvance(ctx.role, assigned)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    this.workflow.assertTransition(job.status, JobStatus.PENDING_APPROVAL);
    return this.applyStatus(
      ctx,
      actorUserId,
      job.id,
      JobStatus.PENDING_APPROVAL,
      AUDIT_JOB_SUBMITTED,
    );
  }

  async complete(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    if (!this.workflow.canApprove(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    this.workflow.assertTransition(job.status, JobStatus.COMPLETED);
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: { status: JobStatus.COMPLETED, completedAt: this.clock.now() },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_COMPLETED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: job.status },
          newValues: { status: JobStatus.COMPLETED },
        },
        tx,
      );
    });
    return this.get(ctx, actorUserId, job.id);
  }

  async returnJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: ReturnJobDto,
  ) {
    if (!this.workflow.canApprove(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    this.workflow.assertTransition(job.status, JobStatus.RETURNED);
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: { status: JobStatus.RETURNED },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_RETURNED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: job.status },
          newValues: { status: JobStatus.RETURNED, reason: dto.reason ?? null },
        },
        tx,
      );
    });
    return this.get(ctx, actorUserId, job.id);
  }

  async resume(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canFieldAdvance(ctx.role, assigned)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    this.workflow.assertTransition(job.status, JobStatus.IN_PROGRESS);
    return this.applyStatus(ctx, actorUserId, job.id, JobStatus.IN_PROGRESS, AUDIT_JOB_STARTED);
  }

  async cancel(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CancelJobDto,
  ) {
    if (!this.workflow.canCancel(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    this.workflow.assertCancel(job.status, dto.reason);
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.CANCELLED,
          cancelledAt: this.clock.now(),
          cancelReason: emptyToNull(dto.reason),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_CANCELLED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: job.status },
          newValues: { status: JobStatus.CANCELLED, reason: dto.reason ?? null },
        },
        tx,
      );
    });
    return this.get(ctx, actorUserId, job.id);
  }

  private async applyStatus(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    status: JobStatus,
    action: string,
  ) {
    const existing = await this.prisma.job.findFirstOrThrow({
      where: withTenant(ctx.organizationId, { id: jobId }),
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: { status },
      });
      await this.audit.record(
        {
          action,
          entityType: 'Job',
          entityId: jobId,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: existing.status },
          newValues: { status },
        },
        tx,
      );
    });
    return this.get(ctx, actorUserId, jobId);
  }

  private async requireVisibleJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const job = await this.prisma.job.findFirst({
      where: {
        AND: [jobVisibilityWhere(ctx, actorUserId, visibleTeamIds), { id: jobId }],
      },
      include: {
        ...LIST_INCLUDE,
        client: {
          select: {
            id: true,
            name: true,
            accountCode: true,
            email: true,
            phone: true,
          },
        },
        site: {
          select: {
            id: true,
            name: true,
            city: true,
            region: true,
            addressLine1: true,
            latitude: true,
            longitude: true,
          },
        },
        workLogs: {
          orderBy: { loggedAt: 'desc' },
          take: 20,
          include: { author: { select: { id: true, fullName: true } } },
        },
        materials: { orderBy: { createdAt: 'desc' }, take: 20 },
        files: { orderBy: { createdAt: 'desc' }, take: 20 },
        signatures: { orderBy: { signedAt: 'desc' }, take: 10 },
        clockSessions: {
          orderBy: { clockInAt: 'desc' },
          take: 20,
          include: { technician: { select: { id: true, fullName: true } } },
        },
        timeEntries: {
          orderBy: { startedAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return job;
  }

  private async requireClientSite(
    organizationId: string,
    clientId: string,
    siteId: string,
  ) {
    const client = await this.prisma.client.findFirst({
      where: withTenant(organizationId, { id: clientId, status: EntityStatus.ACTIVE }),
    });
    if (!client) {
      throw new NotFoundException();
    }
    const site = await this.prisma.site.findFirst({
      where: withTenant(organizationId, { id: siteId }),
    });
    if (!site) {
      throw new NotFoundException();
    }
    if (site.clientId !== clientId) {
      throw new BadRequestException('Site does not belong to the selected client');
    }
    return site;
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
