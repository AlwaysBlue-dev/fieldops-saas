import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = PrismaService | Prisma.TransactionClient;

export type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput, db: Db = this.prisma) {
    return db.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        oldValues: input.oldValues,
        newValues: input.newValues,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }
}
