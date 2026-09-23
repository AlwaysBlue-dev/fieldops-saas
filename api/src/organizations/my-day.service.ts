import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  JobStatus,
  Prisma,
} from '../generated/prisma/client.js';
import {
  formatYmdInZone,
  weekdayCodeInZone,
  zonedDayRange,
} from '../common/timezone.js';
import {
  DEFAULT_GPS_REVIEW_DISTANCE_METERS,
  type WorkWeekDay,
} from '../common/constants.js';
import { toFiniteNumber } from '../common/geo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { ClockService } from './clock.service.js';
import {
  compareScheduled,
  formatSiteAddress,
  myDayJobActions,
  navigationUrl,
  pickCurrentJobId,
} from './my-day-actions.js';

const MY_DAY_INCLUDE = {
  client: { select: { id: true, name: true, phone: true, email: true } },
  site: {
    select: {
      id: true,
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      latitude: true,
      longitude: true,
      siteContactName: true,
      siteContactPhone: true,
      siteContactEmail: true,
      contacts: {
        where: { isPrimary: true },
        take: 1,
        select: {
          name: true,
          phone: true,
          email: true,
        },
      },
    },
  },
  assignments: { select: { userId: true } },
  signatures: { select: { id: true }, take: 1 },
} satisfies Prisma.JobInclude;

@Injectable()
export class MyDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clocks: ClockService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(ctx: OrganizationContext, actorUserId: string) {
    const now = this.clock.now();
    const timeZone = ctx.timezone;
    const date = formatYmdInZone(now, timeZone);
    const weekday = weekdayCodeInZone(now, timeZone);
    const dayRange = zonedDayRange(date, timeZone);
    const session = await this.clocks.currentSession(
      ctx.organizationId,
      actorUserId,
    );
    const [settings, jobs] = await Promise.all([
      this.prisma.organizationSettings.findUnique({
        where: { organizationId: ctx.organizationId },
      }),
      this.prisma.job.findMany({
        where: {
          organizationId: ctx.organizationId,
          assignments: { some: { userId: actorUserId } },
          status: {
            notIn: [JobStatus.DRAFT, JobStatus.CANCELLED],
          },
          OR: [
            {
              scheduledStart: {
                gte: dayRange.start,
                lt: dayRange.end,
              },
            },
            {
              status: {
                in: [
                  JobStatus.IN_PROGRESS,
                  JobStatus.DISPATCHED,
                  JobStatus.RETURNED,
                ],
              },
            },
            session?.jobId ? { id: session.jobId } : { id: { in: [] } },
          ],
        },
        include: MY_DAY_INCLUDE,
      }),
    ]);

    const workingWeek = Array.isArray(settings?.workingWeek)
      ? (settings.workingWeek as WorkWeekDay[])
      : [];
    const sorted = [...jobs].sort(compareScheduled);
    const currentId = pickCurrentJobId(sorted, session?.jobId ?? null);
    const cards = sorted
      .filter((job) => job.status !== JobStatus.COMPLETED)
      .map((job) => this.serializeJob(job, actorUserId, session));
    const currentJob = cards.find((job) => job.id === currentId) ?? null;
    const upcomingJobs = cards.filter((job) => job.id !== currentJob?.id);
    const sessionJob = sorted.find((job) => job.id === session?.jobId);

    return {
      serverNow: now.toISOString(),
      shift: {
        date,
        weekday,
        timeZone,
        isWorkingDay: workingWeek.includes(weekday),
        dailyHoursLimit: settings
          ? Number(settings.defaultDailyHoursLimit)
          : 8,
      },
      clock: session
        ? {
            status: 'CLOCKED_IN' as const,
            session: await this.clocks.presentSession(
              session,
              {
                latitude: toFiniteNumber(sessionJob?.site.latitude),
                longitude: toFiniteNumber(sessionJob?.site.longitude),
              },
              settings?.gpsReviewDistanceMeters ??
                DEFAULT_GPS_REVIEW_DISTANCE_METERS,
            ),
          }
        : { status: 'CLOCKED_OUT' as const, session: null },
      currentJob,
      upcomingJobs,
      actions: {
        canClockIn: !session,
        canClockOut: Boolean(session),
      },
      settings: {
        requireGps: settings?.requireGps ?? false,
        requireClientSignature: settings?.requireClientSignature ?? true,
        gpsReviewDistanceMeters:
          settings?.gpsReviewDistanceMeters ??
          DEFAULT_GPS_REVIEW_DISTANCE_METERS,
      },
    };
  }

  private serializeJob(
    job: Prisma.JobGetPayload<{ include: typeof MY_DAY_INCLUDE }>,
    actorUserId: string,
    session: { jobId: string | null } | null,
  ) {
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    const primaryContact = job.site.contacts[0];
    const contactName =
      job.site.siteContactName ??
      primaryContact?.name ??
      job.clientRepName ??
      null;
    const contactPhone =
      job.site.siteContactPhone ??
      primaryContact?.phone ??
      job.clientRepPhone ??
      job.client.phone ??
      null;
    const contactEmail =
      job.site.siteContactEmail ??
      primaryContact?.email ??
      job.clientRepEmail ??
      job.client.email ??
      null;
    const addressLabel = formatSiteAddress(job.site);
    const latitude = job.site.latitude?.toString() ?? null;
    const longitude = job.site.longitude?.toString() ?? null;
    return {
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      priority: job.priority,
      scheduledStart: job.scheduledStart?.toISOString() ?? null,
      expectedFinish: job.expectedFinish?.toISOString() ?? null,
      scopeSummary: job.scope,
      client: { id: job.client.id, name: job.client.name },
      site: {
        id: job.site.id,
        name: job.site.name,
        addressLabel: addressLabel || null,
        city: job.site.city,
        latitude,
        longitude,
      },
      siteContact:
        contactName || contactPhone || contactEmail
          ? { name: contactName, phone: contactPhone, email: contactEmail }
          : null,
      navigationUrl: navigationUrl({
        latitude,
        longitude,
        addressLabel,
      }),
      actions: myDayJobActions({
        jobId: job.id,
        status: job.status,
        assigned,
        clockedIn: Boolean(session),
        clockJobId: session?.jobId ?? null,
        hasSignature: job.signatures.length > 0,
        requireClientSignOff: job.requireClientSignOff,
      }),
    };
  }
}
