import { organizationRoleLabel } from "@/lib/person-label";
import { StatusPill } from "./status-pill";

export function MemberRoleBadge({ role }: { role?: string | null }) {
  const label = organizationRoleLabel(role);
  return label ? <StatusPill label={label} tone="muted" /> : null;
}
