-- One OPEN clock session per technician (race-safe).
CREATE UNIQUE INDEX "ClockSession_one_open_per_technician_idx"
ON "ClockSession" ("technicianUserId")
WHERE status = 'OPEN';

-- One PENDING invitation per organization + email.
CREATE UNIQUE INDEX "OrganizationInvitation_one_pending_email_per_org_idx"
ON "OrganizationInvitation" ("organizationId", "email")
WHERE status = 'PENDING';
