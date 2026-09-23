-- Crew catalog: team supervisor/code, org-scoped skills, certifications,
-- and optional invitation-to-team assignment.

ALTER TABLE "Team" ADD COLUMN "code" TEXT;
ALTER TABLE "Team" ADD COLUMN "description" TEXT;
ALTER TABLE "Team" ADD COLUMN "supervisorUserId" UUID;

CREATE UNIQUE INDEX "Team_organizationId_code_key" ON "Team"("organizationId", "code");
CREATE INDEX "Team_supervisorUserId_idx" ON "Team"("supervisorUserId");

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_supervisorUserId_fkey"
  FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationInvitation" ADD COLUMN "teamId" UUID;
CREATE INDEX "OrganizationInvitation_teamId_idx" ON "OrganizationInvitation"("teamId");

ALTER TABLE "OrganizationInvitation"
  ADD CONSTRAINT "OrganizationInvitation_teamId_organizationId_fkey"
  FOREIGN KEY ("teamId", "organizationId") REFERENCES "Team"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Skill" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Skill_id_organizationId_key" ON "Skill"("id", "organizationId");
CREATE UNIQUE INDEX "Skill_organizationId_name_key" ON "Skill"("organizationId", "name");

ALTER TABLE "Skill"
  ADD CONSTRAINT "Skill_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TechnicianSkill" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "skillId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TechnicianSkill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnicianSkill_userId_skillId_key" ON "TechnicianSkill"("userId", "skillId");
CREATE INDEX "TechnicianSkill_organizationId_userId_idx" ON "TechnicianSkill"("organizationId", "userId");

ALTER TABLE "TechnicianSkill"
  ADD CONSTRAINT "TechnicianSkill_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianSkill"
  ADD CONSTRAINT "TechnicianSkill_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianSkill"
  ADD CONSTRAINT "TechnicianSkill_skillId_organizationId_fkey"
  FOREIGN KEY ("skillId", "organizationId") REFERENCES "Skill"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TechnicianCertification" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "certificateNumber" TEXT,
  "issuedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "documentRef" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "TechnicianCertification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TechnicianCertification_organizationId_userId_idx"
  ON "TechnicianCertification"("organizationId", "userId");

ALTER TABLE "TechnicianCertification"
  ADD CONSTRAINT "TechnicianCertification_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianCertification"
  ADD CONSTRAINT "TechnicianCertification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
