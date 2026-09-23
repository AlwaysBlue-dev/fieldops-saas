import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ApprovalStatus,
  ApprovalType,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type EnsurePendingApprovalInput = {
  organizationId: string;
  type: ApprovalType;
  subjectType: string;
  subjectId: string;
  requestedByUserId: string;
  requestedAt?: Date;
  assignedApproverUserId?: string | null;
  assignedRole?: OrganizationRole | null;
};

export type MarkDecidedApprovalInput = {
  organizationId: string;
  type: ApprovalType;
  subjectId: string;
  status: ApprovalStatus;
  decision: string;
  comment?: string | null;
  decidedByUserId: string;
  decidedAt: Date;
};

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ApprovalRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensurePending(input: EnsurePendingApprovalInput, db: Db = this.prisma) {
    const existing = await db.approval.findUnique({
      where: {
        organizationId_type_subjectId: {
          organizationId: input.organizationId,
          type: input.type,
          subjectId: input.subjectId,
        },
      },
    });
    if (existing?.status === ApprovalStatus.PENDING) {
      return existing;
    }
    if (existing) {
      return db.approval.update({
        where: { id: existing.id },
        data: {
          status: ApprovalStatus.PENDING,
          subjectType: input.subjectType,
          requestedByUserId: input.requestedByUserId,
          requestedAt: input.requestedAt ?? new Date(),
          assignedApproverUserId: input.assignedApproverUserId ?? null,
          assignedRole: input.assignedRole ?? null,
          decidedByUserId: null,
          decidedAt: null,
          decision: null,
          comment: null,
        },
      });
    }
    try {
      return await db.approval.create({
        data: {
          organizationId: input.organizationId,
          type: input.type,
          status: ApprovalStatus.PENDING,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          requestedByUserId: input.requestedByUserId,
          requestedAt: input.requestedAt ?? new Date(),
          assignedApproverUserId: input.assignedApproverUserId ?? null,
          assignedRole: input.assignedRole ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await db.approval.findUnique({
          where: {
            organizationId_type_subjectId: {
              organizationId: input.organizationId,
              type: input.type,
              subjectId: input.subjectId,
            },
          },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  async markDecided(input: MarkDecidedApprovalInput, db: Db = this.prisma) {
    const updated = await db.approval.updateMany({
      where: {
        organizationId: input.organizationId,
        type: input.type,
        subjectId: input.subjectId,
        status: ApprovalStatus.PENDING,
      },
      data: {
        status: input.status,
        decision: input.decision,
        comment: input.comment?.trim() || null,
        decidedByUserId: input.decidedByUserId,
        decidedAt: input.decidedAt,
      },
    });
    if (updated.count === 0) {
      const row = await db.approval.findUnique({
        where: {
          organizationId_type_subjectId: {
            organizationId: input.organizationId,
            type: input.type,
            subjectId: input.subjectId,
          },
        },
      });
      if (!row) {
        await this.ensurePending(
          {
            organizationId: input.organizationId,
            type: input.type,
            subjectType: subjectTypeFor(input.type),
            subjectId: input.subjectId,
            requestedByUserId: input.decidedByUserId,
          },
          db,
        );
        const created = await db.approval.updateMany({
          where: {
            organizationId: input.organizationId,
            type: input.type,
            subjectId: input.subjectId,
            status: ApprovalStatus.PENDING,
          },
          data: {
            status: input.status,
            decision: input.decision,
            comment: input.comment?.trim() || null,
            decidedByUserId: input.decidedByUserId,
            decidedAt: input.decidedAt,
          },
        });
        if (created.count === 0) {
          throw new BadRequestException(
            'This approval has already been decided',
          );
        }
        return;
      }
      throw new BadRequestException('This approval has already been decided');
    }
  }

  async markCancelled(
    input: {
      organizationId: string;
      type: ApprovalType;
      subjectId: string;
      decidedByUserId: string;
      decidedAt: Date;
    },
    db: Db = this.prisma,
  ) {
    await db.approval.updateMany({
      where: {
        organizationId: input.organizationId,
        type: input.type,
        subjectId: input.subjectId,
        status: ApprovalStatus.PENDING,
      },
      data: {
        status: ApprovalStatus.CANCELLED,
        decision: 'CANCELLED',
        decidedByUserId: input.decidedByUserId,
        decidedAt: input.decidedAt,
      },
    });
  }

  async findBySubject(
    organizationId: string,
    type: ApprovalType,
    subjectId: string,
    db: Db = this.prisma,
  ) {
    return db.approval.findUnique({
      where: {
        organizationId_type_subjectId: {
          organizationId,
          type,
          subjectId,
        },
      },
    });
  }
}

function subjectTypeFor(type: ApprovalType) {
  switch (type) {
    case ApprovalType.JOB_COMPLETION:
      return 'Job';
    case ApprovalType.TIMESHEET:
      return 'TimeEntry';
    case ApprovalType.OVERTIME:
      return 'OvertimeAuthorization';
    default:
      return type;
  }
}
