import { getOrganization } from "./organizations";
import { clockIn, clockOut, readGps } from "./my-day";

export async function readJobClockGps(organizationId: string) {
  const organization = await getOrganization(organizationId);
  return await readGps(Boolean(organization.settings?.requireGps)) ?? {};
}

export async function clockJob(organizationId: string, jobId: string, direction: "in" | "out") {
  const gps = await readJobClockGps(organizationId);
  return direction === "in" ? clockIn(organizationId, { ...gps, jobId }) : clockOut(organizationId, { ...gps, jobId });
}
