import { CERTIFICATION_EXPIRING_SOON_DAYS } from '../common/constants.js';
import type {
  EntityStatus,
  OrganizationRole,
  TechnicianCertification,
} from '../generated/prisma/client.js';
import { addUtcDays } from '../subscription/clock.js';
import {
  isSensitiveCrewFieldVisible,
  type CrewViewer,
} from './crew-access.js';

export type CertificationStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

export function certificationStatus(
  expiresAt: Date | null,
  now: Date,
): CertificationStatus {
  if (!expiresAt) {
    return 'VALID';
  }
  if (expiresAt.getTime() < now.getTime()) {
    return 'EXPIRED';
  }
  const soon = addUtcDays(now, CERTIFICATION_EXPIRING_SOON_DAYS);
  if (expiresAt.getTime() <= soon.getTime()) {
    return 'EXPIRING_SOON';
  }
  return 'VALID';
}

export function serializePersonSummary(user: {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role?: OrganizationRole;
}) {
  return {
    userId: user.id,
    fullName: user.fullName,
    role: user.role ?? null,
  };
}

export function serializeCertification(
  row: TechnicianCertification,
  now: Date,
  viewer: CrewViewer,
) {
  const status = certificationStatus(row.expiresAt, now);
  const base = {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    name: row.name,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (!isSensitiveCrewFieldVisible(viewer)) {
    return {
      ...base,
      certificateNumber: null,
      documentRef: null,
    };
  }
  return {
    ...base,
    certificateNumber: row.certificateNumber,
    documentRef: row.documentRef,
  };
}

export function serializeSkill(skill: { id: string; organizationId: string; name: string }) {
  return {
    id: skill.id,
    organizationId: skill.organizationId,
    name: skill.name,
  };
}

export function serializeTeamSummary(team: {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  status: EntityStatus;
  createdAt: Date;
  updatedAt: Date;
  supervisor?: { id: string; fullName: string } | null;
  memberCount?: number;
  members?: Array<{
    userId: string;
    fullName: string;
    role: OrganizationRole | null;
  }>;
  skillNames?: string[];
}) {
  return {
    id: team.id,
    organizationId: team.organizationId,
    name: team.name,
    code: team.code,
    description: team.description,
    status: team.status,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
    supervisor: team.supervisor
      ? { userId: team.supervisor.id, fullName: team.supervisor.fullName }
      : null,
    memberCount: team.memberCount ?? team.members?.length ?? 0,
    members: team.members ?? [],
    skillSummary: team.skillNames ?? [],
  };
}
