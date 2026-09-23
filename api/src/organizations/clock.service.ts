import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  ClockSessionStatus,
  JobStatus,
  OrganizationRole,
  Prisma,
  TimeEntrySource,
  TimeEntryStatus,
  TimeEntryType,
} from '../generated/prisma/client.js';
import {
  AUDIT_CLOCK_IN,
  AUDIT_CLOCK_OUT,
  AUDIT_JOB_STARTED,
  CLOCK_OUT_IDEMPOTENT_MS,
} from '../common/constants.js';
import { formatYmdInZone } from '../common/timezone.js';
import { durationMinutesFromRange } from './timesheet-validation.js';
import {
  persistValidation,
  TimesheetValidationService,
} from './timesheet-validation.service.js';
import {
  assertCoordinatePair,
  DEFAULT_GPS_REVIEW_DISTANCE_METERS,
  locationEvidence,
  toFiniteNumber,
  type LocationEvidence,
} from '../common/geo.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { ClockInDto, ClockOutDto, GpsEvidenceDto } from './dto/clock-action.dto.js';
import { canManageCrew } from './crew-access.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { TeamsService } from './teams.service.js';
import { jobVisibilityWhere } from './job-visibility.js';

@Injectable()
export class ClockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workflow: JobWorkflowService,
    private readonly teams: TeamsService,
    private readonly timesheetValidation: TimesheetValidationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async currentSession(organizationId: string, technicianUserId: string) {
    return this.prisma.clockSession.findFirst({
      where: {
        organizationId,
        technicianUserId,
        status: ClockSessionStatus.OPEN,
      },
    });
  }

  async clockIn(
    ctx: OrganizationContext,
    actorUserId: string,
    dto: ClockInDto,
  ) {
    const settings = await this.requireSettings(ctx.organizationId);
    const gps = this.readGps(dto, settings.requireGps);
    const existing = await this.currentSession(ctx.organizationId, actorUserId);
    if (existing) {
      throw new ConflictException('Already clocked in');
    }

    let jobId: string | null = dto.jobId ?? null;
    let startedJob = false;
    let site = { latitude: null as number | null, longitude: null as number | null };
    if (jobId) {
      const job = await this.requireAssignedClockable(ctx, actorUserId, jobId);
      site = {
        latitude: toFiniteNumber(job.site.latitude),
        longitude: toFiniteNumber(job.site.longitude),
      };
      if (job.status === JobStatus.DISPATCHED) {
        this.workflow.assertTransition(job.status, JobStatus.IN_PROGRESS);
        startedJob = true;
      }
    }

    const now = this.clock.now();
    const evidence = locationEvidence({
      ...gps,
      siteLatitude: site.latitude,
      siteLongitude: site.longitude,
      reviewDistanceMeters: settings.gpsReviewDistanceMeters,
    });

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const created = await tx.clockSession.create({
          data: {
            organizationId: ctx.organizationId,
            technicianUserId: actorUserId,
            jobId,
            clockInAt: now,
            clockInLatitude: coord(gps.latitude),
            clockInLongitude: coord(gps.longitude),
            clockInAccuracyMeters: coord(gps.accuracyMeters, 2),
            status: ClockSessionStatus.OPEN,
          },
        });
        if (startedJob && jobId) {
          const progressed = await tx.job.updateMany({
            where: {
              id: jobId,
              organizationId: ctx.organizationId,
              status: JobStatus.DISPATCHED,
            },
            data: { status: JobStatus.IN_PROGRESS },
          });
          if (progressed.count === 1) {
            await this.audit.record(
              {
                action: AUDIT_JOB_STARTED,
                entityType: 'Job',
                entityId: jobId,
                organizationId: ctx.organizationId,
                actorUserId,
                oldValues: { status: JobStatus.DISPATCHED },
                newValues: { status: JobStatus.IN_PROGRESS },
              },
              tx,
            );
          }
        }
        await this.audit.record(
          {
            action: AUDIT_CLOCK_IN,
            entityType: 'ClockSession',
            entityId: created.id,
            organizationId: ctx.organizationId,
            actorUserId,
            newValues: {
              jobId,
              clockInAt: now.toISOString(),
              clientOccurredAt: dto.clientOccurredAt ?? null,
              location: auditLocation(evidence),
            },
          },
          tx,
        );
        return created;
      });
      return this.serializeSession(session, evidence);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Already clocked in');
      }
      throw error;
    }
  }

  async clockOut(
    ctx: OrganizationContext,
    actorUserId: string,
    dto: ClockOutDto,
  ) {
    const settings = await this.requireSettings(ctx.organizationId);
    const gps = this.readGps(dto, settings.requireGps);
    const now = this.clock.now();
    const existing = await this.currentSession(ctx.organizationId, actorUserId);
    if (!existing) {
      const replayed = await this.recentClosedSession(
        ctx.organizationId,
        actorUserId,
        now,
      );
      if (replayed) {
        return replayed;
      }
      throw new BadRequestException('Not clocked in');
    }

    const site = existing.jobId
      ? await this.siteCoords(ctx.organizationId, existing.jobId)
      : { latitude: null, longitude: null };
    const durationMinutes = Math.max(
      0,
      durationMinutesFromRange(existing.clockInAt, now),
    );
    const workDate = formatYmdInZone(existing.clockInAt, settings.timezone);
    const validation = await this.timesheetValidation.evaluate({
      organizationId: ctx.organizationId,
      userId: actorUserId,
      source: TimeEntrySource.CLOCK_SESSION,
      type: TimeEntryType.NORMAL,
      startAt: existing.clockInAt,
      endAt: now,
      workDate,
      description: null,
      jobId: existing.jobId,
      now,
    });
    const outEvidence = locationEvidence({
      ...gps,
      siteLatitude: site.latitude,
      siteLongitude: site.longitude,
      reviewDistanceMeters: settings.gpsReviewDistanceMeters,
    });
    const inEvidence = locationEvidence({
      latitude: toFiniteNumber(existing.clockInLatitude),
      longitude: toFiniteNumber(existing.clockInLongitude),
      accuracyMeters: toFiniteNumber(existing.clockInAccuracyMeters),
      siteLatitude: site.latitude,
      siteLongitude: site.longitude,
      reviewDistanceMeters: settings.gpsReviewDistanceMeters,
    });

    const closed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clockSession.updateMany({
        where: {
          id: existing.id,
          organizationId: ctx.organizationId,
          status: ClockSessionStatus.OPEN,
        },
        data: {
          status: ClockSessionStatus.CLOSED,
          clockOutAt: now,
          clockOutLatitude: coord(gps.latitude),
          clockOutLongitude: coord(gps.longitude),
          clockOutAccuracyMeters: coord(gps.accuracyMeters, 2),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Clock session is no longer open');
      }
      await tx.timeEntry.upsert({
        where: { clockSessionId: existing.id },
        create: {
          organizationId: ctx.organizationId,
          userId: actorUserId,
          jobId: existing.jobId,
          clockSessionId: existing.id,
          workDate: new Date(`${workDate}T00:00:00.000Z`),
          startedAt: existing.clockInAt,
          endedAt: now,
          durationMinutes,
          type: TimeEntryType.NORMAL,
          source: TimeEntrySource.CLOCK_SESSION,
          status: TimeEntryStatus.DRAFT,
          validation: persistValidation(validation),
        },
        update: {
          workDate: new Date(`${workDate}T00:00:00.000Z`),
          endedAt: now,
          durationMinutes,
          jobId: existing.jobId,
          type: TimeEntryType.NORMAL,
          source: TimeEntrySource.CLOCK_SESSION,
          validation: persistValidation(validation),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_CLOCK_OUT,
          entityType: 'ClockSession',
          entityId: existing.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: {
            clockOutAt: now.toISOString(),
            durationMinutes,
            clientOccurredAt: dto.clientOccurredAt ?? null,
            location: auditLocation(outEvidence),
          },
        },
        tx,
      );
      return tx.clockSession.findFirstOrThrow({
        where: { id: existing.id, organizationId: ctx.organizationId },
      });
    });

    return this.serializeSession(closed, inEvidence, outEvidence, durationMinutes);
  }

  async getSession(
    ctx: OrganizationContext,
    actorUserId: string,
    sessionId: string,
  ) {
    const session = await this.prisma.clockSession.findFirst({
      where: { id: sessionId, organizationId: ctx.organizationId },
      include: {
        technician: { select: { id: true, fullName: true } },
        job: {
          select: {
            id: true,
            jobNumber: true,
            title: true,
            site: { select: { latitude: true, longitude: true, name: true } },
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException();
    }
    await this.assertCanInspect(ctx, actorUserId, session.technicianUserId);
    const settings = await this.requireSettings(ctx.organizationId);
    const site = {
      latitude: toFiniteNumber(session.job?.site.latitude),
      longitude: toFiniteNumber(session.job?.site.longitude),
    };
    const clockInEvidence = locationEvidence({
      latitude: toFiniteNumber(session.clockInLatitude),
      longitude: toFiniteNumber(session.clockInLongitude),
      accuracyMeters: toFiniteNumber(session.clockInAccuracyMeters),
      siteLatitude: site.latitude,
      siteLongitude: site.longitude,
      reviewDistanceMeters: settings.gpsReviewDistanceMeters,
    });
    const clockOutEvidence = session.clockOutAt
      ? locationEvidence({
          latitude: toFiniteNumber(session.clockOutLatitude),
          longitude: toFiniteNumber(session.clockOutLongitude),
          accuracyMeters: toFiniteNumber(session.clockOutAccuracyMeters),
          siteLatitude: site.latitude,
          siteLongitude: site.longitude,
          reviewDistanceMeters: settings.gpsReviewDistanceMeters,
        })
      : null;
    return {
      ...this.serializeSession(
        session,
        clockInEvidence,
        clockOutEvidence,
        null,
      ),
      technician: {
        userId: session.technician.id,
        fullName: session.technician.fullName,
      },
      job: session.job
        ? {
            id: session.job.id,
            jobNumber: session.job.jobNumber,
            title: session.job.title,
            siteName: session.job.site.name,
          }
        : null,
    };
  }

  async presentSession(
    session: {
      id: string;
      organizationId: string;
      technicianUserId: string;
      jobId: string | null;
      status: ClockSessionStatus;
      clockInAt: Date;
      clockOutAt: Date | null;
      clockInLatitude: Prisma.Decimal | number | string | null;
      clockInLongitude: Prisma.Decimal | number | string | null;
      clockInAccuracyMeters: Prisma.Decimal | number | string | null;
      clockOutLatitude?: Prisma.Decimal | number | string | null;
      clockOutLongitude?: Prisma.Decimal | number | string | null;
      clockOutAccuracyMeters?: Prisma.Decimal | number | string | null;
    },
    site: { latitude: number | null; longitude: number | null },
    reviewDistanceMeters: number,
    durationMinutes?: number | null,
  ) {
    const clockInEvidence = locationEvidence({
      latitude: toFiniteNumber(session.clockInLatitude),
      longitude: toFiniteNumber(session.clockInLongitude),
      accuracyMeters: toFiniteNumber(session.clockInAccuracyMeters),
      siteLatitude: site.latitude,
      siteLongitude: site.longitude,
      reviewDistanceMeters,
    });
    const clockOutEvidence = session.clockOutAt
      ? locationEvidence({
          latitude: toFiniteNumber(session.clockOutLatitude),
          longitude: toFiniteNumber(session.clockOutLongitude),
          accuracyMeters: toFiniteNumber(session.clockOutAccuracyMeters),
          siteLatitude: site.latitude,
          siteLongitude: site.longitude,
          reviewDistanceMeters,
        })
      : null;
    return this.serializeSession(
      session,
      clockInEvidence,
      clockOutEvidence,
      durationMinutes,
    );
  }

  serializeSession(
    session: {
      id: string;
      organizationId: string;
      technicianUserId: string;
      jobId: string | null;
      status: ClockSessionStatus;
      clockInAt: Date;
      clockOutAt: Date | null;
    },
    clockInEvidence?: LocationEvidence | null,
    clockOutEvidence?: LocationEvidence | null,
    durationMinutes?: number | null,
  ) {
    return {
      id: session.id,
      organizationId: session.organizationId,
      technicianUserId: session.technicianUserId,
      jobId: session.jobId,
      status: session.status,
      clockInAt: session.clockInAt.toISOString(),
      clockOutAt: session.clockOutAt?.toISOString() ?? null,
      durationMinutes: durationMinutes ?? null,
      clockInEvidence: clockInEvidence ?? null,
      clockOutEvidence: clockOutEvidence ?? null,
    };
  }

  private readGps(dto: GpsEvidenceDto, required: boolean) {
    try {
      assertCoordinatePair(dto.latitude, dto.longitude);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid coordinates',
      );
    }
    if (required && (dto.latitude == null || dto.longitude == null)) {
      throw new BadRequestException('GPS coordinates are required to clock');
    }
    return {
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      accuracyMeters: dto.accuracyMeters ?? null,
    };
  }

  private async requireSettings(organizationId: string) {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    return {
      requireGps: settings?.requireGps ?? false,
      gpsReviewDistanceMeters:
        settings?.gpsReviewDistanceMeters ?? DEFAULT_GPS_REVIEW_DISTANCE_METERS,
      timezone: settings?.timezone ?? 'UTC',
    };
  }

  private async recentClosedSession(
    organizationId: string,
    technicianUserId: string,
    now: Date,
  ) {
    const recent = await this.prisma.clockSession.findFirst({
      where: {
        organizationId,
        technicianUserId,
        status: ClockSessionStatus.CLOSED,
        clockOutAt: { gte: new Date(now.getTime() - CLOCK_OUT_IDEMPOTENT_MS) },
      },
      orderBy: { clockOutAt: 'desc' },
    });
    if (!recent) return null;
    const entry = await this.prisma.timeEntry.findFirst({
      where: { clockSessionId: recent.id, organizationId },
    });
    if (!entry) return null;
    const settings = await this.requireSettings(organizationId);
    const site = recent.jobId
      ? await this.siteCoords(organizationId, recent.jobId)
      : { latitude: null, longitude: null };
    const inEvidence = locationEvidence({
      latitude: toFiniteNumber(recent.clockInLatitude),
      longitude: toFiniteNumber(recent.clockInLongitude),
      accuracyMeters: toFiniteNumber(recent.clockInAccuracyMeters),
      siteLatitude: site.latitude,
      siteLongitude: site.longitude,
      reviewDistanceMeters: settings.gpsReviewDistanceMeters,
    });
    const outEvidence = recent.clockOutAt
      ? locationEvidence({
          latitude: toFiniteNumber(recent.clockOutLatitude),
          longitude: toFiniteNumber(recent.clockOutLongitude),
          accuracyMeters: toFiniteNumber(recent.clockOutAccuracyMeters),
          siteLatitude: site.latitude,
          siteLongitude: site.longitude,
          reviewDistanceMeters: settings.gpsReviewDistanceMeters,
        })
      : null;
    return this.serializeSession(
      recent,
      inEvidence,
      outEvidence,
      entry.durationMinutes,
    );
  }

  private async siteCoords(organizationId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId },
      select: { site: { select: { latitude: true, longitude: true } } },
    });
    return {
      latitude: toFiniteNumber(job?.site.latitude),
      longitude: toFiniteNumber(job?.site.longitude),
    };
  }

  private async assertCanInspect(
    ctx: OrganizationContext,
    actorUserId: string,
    technicianUserId: string,
  ) {
    if (actorUserId === technicianUserId) return;
    if (canManageCrew(ctx.role)) return;
    if (ctx.role === OrganizationRole.SUPERVISOR) {
      const teamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
      if (teamIds.length === 0) {
        throw new ForbiddenException('Insufficient organization role');
      }
      const onTeam = await this.prisma.teamMember.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: technicianUserId,
          teamId: { in: teamIds },
        },
      });
      if (onTeam) return;
    }
    throw new NotFoundException();
  }

  private async requireAssignedClockable(
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
        assignments: { select: { userId: true } },
        site: { select: { latitude: true, longitude: true } },
      },
    });
    if (!job) {
      throw new NotFoundException();
    }
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canClockAgainst(ctx.role, assigned, job.status)) {
      throw new ForbiddenException('This job is not available to clock');
    }
    return job;
  }
}

function coord(value?: number | null, scale = 7) {
  if (value == null || Number.isNaN(value)) return undefined;
  return value.toFixed(scale);
}

function auditLocation(evidence: LocationEvidence) {
  return {
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    accuracyMeters: evidence.accuracyMeters,
    distanceFromSiteMeters: evidence.distanceFromSiteMeters,
    locationStatus: evidence.locationStatus,
  };
}
