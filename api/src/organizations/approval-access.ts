import { ForbiddenException } from '@nestjs/common';

export function assertNotSelfApproval(
  actorUserId: string,
  subjectUserIds: Array<string | null | undefined>,
) {
  const subjects = new Set(
    subjectUserIds.filter((id): id is string => Boolean(id)),
  );
  if (subjects.has(actorUserId)) {
    throw new ForbiddenException(
      'You cannot approve your own operational records',
    );
  }
}
