import type { OrganizationContext } from '../../tenancy/request-context.js';
import type { AiToolContext } from './ai-tool.types.js';

/**
 * Build trusted tool context from NestJS membership / request state.
 * Never call this with model-supplied organization or role fields.
 */
export function buildAiToolContext(input: {
  organization: OrganizationContext;
  userId: string;
  sessionId?: string;
  usageEventId?: string;
}): AiToolContext {
  return {
    organizationId: input.organization.organizationId,
    userId: input.userId,
    membershipId: input.organization.membershipId,
    role: input.organization.role,
    organizationName: input.organization.name,
    organizationSlug: input.organization.slug,
    timezone: input.organization.timezone,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.usageEventId ? { usageEventId: input.usageEventId } : {}),
  };
}
