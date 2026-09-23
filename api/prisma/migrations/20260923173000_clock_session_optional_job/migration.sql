-- Allow day-level clock sessions (no job attached).
ALTER TABLE "ClockSession" ALTER COLUMN "jobId" DROP NOT NULL;
