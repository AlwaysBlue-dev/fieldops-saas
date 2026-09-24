import type { User } from '../generated/prisma/client.js';
import type { AuthUser } from '../tenancy/request-context.js';

type UserLike = User & { trialUsedAt?: Date | null };

export function toPublicUser(user: UserLike): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    platformRole: user.platformRole,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    trialEligible: user.trialUsedAt == null,
  };
}
