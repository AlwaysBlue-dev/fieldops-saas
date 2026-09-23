/**
 * Always include organizationId from verified membership context.
 * Never treat a client-supplied organization id as authorization.
 */
export function withTenant<T extends object>(
  organizationId: string,
  where: T,
): T & { organizationId: string } {
  return { ...where, organizationId };
}
