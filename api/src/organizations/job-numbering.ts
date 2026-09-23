import { JOB_NUMBER_PAD } from '../common/constants.js';
import type { Prisma } from '../generated/prisma/client.js';

export function formatJobNumber(prefix: string, sequence: number) {
  const safePrefix = prefix || 'JOB-';
  return `${safePrefix}${String(sequence).padStart(JOB_NUMBER_PAD, '0')}`;
}

/** Increment OrganizationCounter.jobNext inside the caller's transaction. */
export async function allocateJobNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const settings = await tx.organizationSettings.findUniqueOrThrow({
    where: { organizationId },
    select: { jobNumberPrefix: true },
  });
  const counter = await tx.organizationCounter.update({
    where: { organizationId },
    data: { jobNext: { increment: 1 } },
  });
  return formatJobNumber(settings.jobNumberPrefix, counter.jobNext - 1);
}
