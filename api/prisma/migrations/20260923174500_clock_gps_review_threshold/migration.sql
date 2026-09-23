-- Default site-distance review threshold is 250 metres.
ALTER TABLE "OrganizationSettings"
  ALTER COLUMN "gpsReviewDistanceMeters" SET DEFAULT 250;

UPDATE "OrganizationSettings"
SET "gpsReviewDistanceMeters" = 250
WHERE "gpsReviewDistanceMeters" = 150;

-- One TimeEntry per clock session so clock-out can create/update safely.
CREATE UNIQUE INDEX "TimeEntry_clockSessionId_key" ON "TimeEntry"("clockSessionId");
