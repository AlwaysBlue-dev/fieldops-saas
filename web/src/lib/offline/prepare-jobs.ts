import type { OrganizationMembership, PublicUser } from "@/lib/auth";
import { getJobCard, type JobDetail } from "@/lib/jobs";
import { getMyDay } from "@/lib/my-day";
import { cachePreparedJobDocuments } from "./cache-nav";
import {
  listOfflineJobs,
  putOfflineJob,
  putOfflineMyDay,
  putOfflineShellContext,
  type OfflineJobSnapshot,
} from "./db";

export type PrepareOfflineResult = {
  downloaded: number;
  failed: number;
  jobs: OfflineJobSnapshot[];
  errors: string[];
};

export type PrepareOfflineContext = {
  user: PublicUser;
  membership: OrganizationMembership;
};

/**
 * Download assigned My Day jobs (current + upcoming) for offline use.
 * Uses existing job-detail authorization; does not dump the org catalog.
 * Also stores shell + My Day snapshots for cold offline reopen.
 */
export async function prepareAssignedJobsForOffline(
  organizationId: string,
  userId: string,
  context?: PrepareOfflineContext,
): Promise<PrepareOfflineResult> {
  const day = await getMyDay(organizationId);
  const ids = new Set<string>();
  if (day.currentJob?.id) ids.add(day.currentJob.id);
  for (const job of day.upcomingJobs) ids.add(job.id);

  const errors: string[] = [];
  let downloaded = 0;
  let failed = 0;
  const now = new Date().toISOString();

  await putOfflineMyDay({
    key: "",
    organizationId,
    userId,
    savedAt: now,
    payload: day,
  });

  if (context) {
    await putOfflineShellContext({
      key: "",
      userId,
      organizationId,
      orgSlug: context.membership.organization.slug,
      timezone: context.membership.organization.timezone,
      role: context.membership.role,
      user: context.user,
      membership: context.membership,
      savedAt: now,
    });
  }

  for (const jobId of ids) {
    try {
      const detail: JobDetail = await getJobCard(organizationId, jobId);
      await putOfflineJob({
        jobId: detail.id,
        organizationId,
        userId,
        downloadedAt: now,
        lastSyncedAt: now,
        payload: detail,
      });
      downloaded += 1;
    } catch (error) {
      failed += 1;
      errors.push(
        error instanceof Error
          ? error.message
          : `Could not download job ${jobId}.`,
      );
    }
  }

  if (context) {
    await cachePreparedJobDocuments(
      context.membership.organization.slug,
      [...ids],
    ).catch(() => undefined);
  }

  const jobs = await listOfflineJobs(organizationId, userId);
  return { downloaded, failed, jobs, errors };
}

/** Persist shell context after a successful online session load (no job dump). */
export async function rememberOfflineShellContext(
  context: PrepareOfflineContext,
) {
  await putOfflineShellContext({
    key: "",
    userId: context.user.id,
    organizationId: context.membership.organization.id,
    orgSlug: context.membership.organization.slug,
    timezone: context.membership.organization.timezone,
    role: context.membership.role,
    user: context.user,
    membership: context.membership,
    savedAt: new Date().toISOString(),
  });
}

/** Persist latest My Day payload for offline reopen. */
export async function rememberOfflineMyDay(
  organizationId: string,
  userId: string,
  payload: Awaited<ReturnType<typeof getMyDay>>,
) {
  await putOfflineMyDay({
    key: "",
    organizationId,
    userId,
    savedAt: new Date().toISOString(),
    payload,
  });
}
