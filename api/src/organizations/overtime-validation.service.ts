import { Injectable } from '@nestjs/common';
import {
  OvertimeAuthorizationStatus,
  TimeEntryStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  evaluateOvertimeAuthorization,
  type OvertimeAuthorizationView,
} from './overtime-validation.js';
import type { TimesheetCheck } from './timesheet-validation.js';

const COUNTED: TimeEntryStatus[] = [
  TimeEntryStatus.DRAFT,
  TimeEntryStatus.SUBMITTED,
  TimeEntryStatus.PENDING,
  TimeEntryStatus.APPROVED,
  TimeEntryStatus.RETURNED,
];

export type OvertimeWriteContext = {
  organizationId: string;
  technicianUserId: string;
  jobId: string | null;
  workDate: string | null;
  startAt: Date | null;
  endAt: Date | null;
  durationMinutes: number | null;
  type: string;
  preferredAuthorizationId?: string | null;
  excludeEntryId?: string | null;
};

@Injectable()
export class OvertimeValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForEntry(input: OvertimeWriteContext): Promise<{
    checks: TimesheetCheck[];
    authorization: OvertimeAuthorizationView | null;
  }> {
    if (input.type !== 'OVERTIME') {
      return { checks: [], authorization: null };
    }

    const authorization = input.preferredAuthorizationId
      ? await this.loadAuthorization(
          input.organizationId,
          input.preferredAuthorizationId,
        )
      : await this.findCoveringAuthorization(input);

    const usedMinutes = authorization
      ? await this.usedMinutes(
          input.organizationId,
          authorization.id,
          input.excludeEntryId,
        )
      : 0;

    return {
      authorization,
      checks: evaluateOvertimeAuthorization({
        type: input.type,
        organizationId: input.organizationId,
        technicianUserId: input.technicianUserId,
        jobId: input.jobId,
        workDate: input.workDate,
        startAt: input.startAt,
        endAt: input.endAt,
        durationMinutes: input.durationMinutes,
        linkedAuthorizationId: authorization?.id ?? null,
        authorization,
        usedMinutes,
      }),
    };
  }

  async usedMinutes(
    organizationId: string,
    authorizationId: string,
    excludeEntryId?: string | null,
  ) {
    const rows = await this.prisma.timeEntry.findMany({
      where: {
        organizationId,
        overtimeAuthorizationId: authorizationId,
        status: { in: COUNTED },
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
      select: { durationMinutes: true },
    });
    return rows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
  }

  async loadAuthorization(organizationId: string, id: string) {
    const row = await this.prisma.overtimeAuthorization.findFirst({
      where: { id, organizationId },
    });
    return row ? toView(row) : null;
  }

  async findCoveringAuthorization(input: OvertimeWriteContext) {
    if (!input.jobId || !input.workDate || !input.startAt || !input.endAt) {
      return null;
    }
    const rows = await this.prisma.overtimeAuthorization.findMany({
      where: {
        organizationId: input.organizationId,
        userId: input.technicianUserId,
        jobId: input.jobId,
        workDate: new Date(`${input.workDate}T00:00:00.000Z`),
        status: OvertimeAuthorizationStatus.APPROVED,
        authorizedStart: { lte: input.startAt },
        authorizedEnd: { gte: input.endAt },
      },
      orderBy: { authorizedStart: 'asc' },
    });
    for (const row of rows) {
      const used = await this.usedMinutes(
        input.organizationId,
        row.id,
        input.excludeEntryId,
      );
      const duration = input.durationMinutes ?? 0;
      if (used + duration <= row.maxMinutes) {
        return toView(row);
      }
    }
    return rows[0] ? toView(rows[0]) : null;
  }
}

function toView(row: {
  id: string;
  organizationId: string;
  userId: string;
  jobId: string;
  workDate: Date;
  authorizedStart: Date;
  authorizedEnd: Date;
  maxMinutes: number;
  status: string;
}): OvertimeAuthorizationView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    jobId: row.jobId,
    workDate: row.workDate.toISOString().slice(0, 10),
    authorizedStart: row.authorizedStart,
    authorizedEnd: row.authorizedEnd,
    maxMinutes: row.maxMinutes,
    status: row.status,
  };
}
