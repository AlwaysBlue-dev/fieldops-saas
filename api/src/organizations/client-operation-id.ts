import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Offline sync uses a stable clientOperationId as the row primary key (UUID).
 * Retries look up by { id, organizationId, jobId } and return the original row
 * instead of inserting again. No extra schema column is required.
 */
export function asRecordId(clientOperationId: string | undefined): string | undefined {
  if (clientOperationId == null || clientOperationId === '') return undefined;
  return clientOperationId;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

export function rejectCrossTenantReplay(): never {
  throw new BadRequestException(
    'This client operation id is already used for a different job or organization',
  );
}
