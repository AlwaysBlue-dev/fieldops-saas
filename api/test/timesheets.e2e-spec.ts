import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  JobPriority,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  SubscriptionStatus,
  TimeEntrySource,
  TimeEntryStatus,
  TimeEntryType,
  UserStatus,
} from '../src/generated/prisma/client.js';
import {
  api,
  createTestApp,
  loginAs,
  prismaFrom,
  withCsrf,
} from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Timesheets (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = prismaFrom(app);
    northstarId = (
      await prisma.organization.findUniqueOrThrow({
        where: { slug: 'northstar-electrical' },
      })
    ).id;
    bluepeakId = (
      await prisma.organization.findUniqueOrThrow({
        where: { slug: 'bluepeak-hvac' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function signupOrg(label: string) {
    const suffix = `${Date.now()}-${label}`;
    const agent = api(app);
    const signup = await withCsrf(agent.post('/api/auth/signup')).send({
      email: `owner-${suffix}@time.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Time Owner ${label}`,
      organizationName: `Time Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    return {
      agent,
      organizationId: signup.body.organization.id as string,
      ownerId: signup.body.user.id as string,
    };
  }

  async function addMember(
    organizationId: string,
    label: string,
    role: OrganizationRole,
  ) {
    const email = `${role.toLowerCase()}-${label}-${Date.now()}@time.fieldops.test`;
    const user = await prismaFrom(app).user.create({
      data: {
        email,
        fullName: `${role} ${label}`,
        passwordHash: await hash(SEED_PASSWORD, 4),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    await prismaFrom(app).organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role,
        status: MembershipStatus.ACTIVE,
      },
    });
    return { user, email };
  }

  async function openJob(
    agent: ReturnType<typeof api>,
    organizationId: string,
    technicianUserId: string,
    title: string,
  ) {
    const prisma = prismaFrom(app);
    const client = await prisma.client.create({
      data: { organizationId, name: `Client ${title}` },
    });
    const site = await prisma.site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: `Site ${title}`,
        city: 'Chicago',
        country: 'US',
        latitude: '41.8820000',
        longitude: '-87.6370000',
      },
    });
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs`),
    ).send({
      title,
      clientId: client.id,
      siteId: site.id,
      jobType: 'SERVICE_CALL',
      priority: JobPriority.NORMAL,
      technicianUserIds: [technicianUserId],
      scheduledStart: new Date().toISOString(),
      expectedFinish: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(created.status).toBe(201);
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/schedule`),
    ).send({
      scheduledStart: created.body.scheduledStart,
      expectedFinish: created.body.expectedFinish,
      technicianUserIds: [technicianUserId],
      confirmOverlap: true,
    });
    return created.body as { id: string; scheduledStart: string };
  }

  function yesterdayYmd() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function tomorrowYmd() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  it('creates authorized manual time with server duration and structured validation', async () => {
    const { agent, organizationId } = await signupOrg('manual');
    const tech = await addMember(
      organizationId,
      'manual',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Manual job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true, defaultDailyHoursLimit: 8 },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const workDate = yesterdayYmd();
    const created = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate,
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '17:00',
      description: 'Replaced contactor and tested circuits.',
    });
    expect(created.status).toBe(201);
    expect(created.body.durationMinutes).toBe(9 * 60);
    expect(created.body.source).toBe('MANUAL');
    expect(created.body.status).toBe('PENDING');
    expect(created.body.validation.status).toBe('REVIEW');
    expect(created.body.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LONG_SHIFT', severity: 'WARNING' }),
      ]),
    );

    const week = await techAgent.get(
      `/api/organizations/${organizationId}/timesheets`,
    );
    expect(week.status).toBe(200);
    expect(week.body.technician.userId).toBe(tech.user.id);
    expect(week.body.recent[0].id).toBe(created.body.id);
  });

  it('blocks future date, invalid range, short duration, and disabled manual policy', async () => {
    const { agent, organizationId } = await signupOrg('rules');
    const tech = await addMember(
      organizationId,
      'rules',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Rules job');
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);

    const disabled = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '09:00',
      description: 'Valid description text.',
    });
    expect(disabled.status).toBe(400);
    expect(disabled.body.error).toBe('TIMESHEET_BLOCKED');
    expect(disabled.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'MANUAL_DISABLED',
    );

    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true },
    });

    const future = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: tomorrowYmd(),
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '09:00',
      description: 'Future work should be blocked.',
    });
    expect(future.status).toBe(400);
    expect(future.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'FUTURE_WORK_DATE',
    );

    const range = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '11:00',
      endTime: '10:00',
      description: 'Finish is before start time.',
    });
    expect(range.status).toBe(400);
    expect(range.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'INVALID_RANGE',
    );

    const short = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '08:10',
      description: 'Too short to count as manual time.',
    });
    expect(short.status).toBe(400);
    expect(short.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'MIN_DURATION',
    );
  });

  it('prevents overlapping manual entries and completed-job writes', async () => {
    const { agent, organizationId } = await signupOrg('overlap');
    const tech = await addMember(
      organizationId,
      'overlap',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Overlap job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const first = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '10:00',
      description: 'Morning diagnostics and isolation.',
    });
    expect(first.status).toBe(201);

    const overlap = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'TRAVEL',
      startTime: '09:00',
      endTime: '11:00',
      description: 'Travel that overlaps the morning block.',
    });
    expect(overlap.status).toBe(400);
    expect(overlap.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'OVERLAP',
    );

    await prismaFrom(app).job.update({
      where: { id: job.id },
      data: { status: JobStatus.COMPLETED },
    });
    const completed = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '13:00',
      endTime: '14:00',
      description: 'After-hours note on a completed job.',
    });
    expect(completed.status).toBe(400);
    expect(completed.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'COMPLETED_JOB',
    );
  });

  it('keeps technicians on their own time and hides foreign tenant rows', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('scope');
    const tech = await addMember(
      organizationId,
      'scope',
      OrganizationRole.TECHNICIAN,
    );
    const other = await addMember(
      organizationId,
      'other',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Scope job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const created = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '09:00',
      description: 'Own technician time only.',
    });
    expect(created.status).toBe(201);

    const { agent: otherAgent } = await loginAs(app, other.email, SEED_PASSWORD);
    const hiddenWeek = await otherAgent.get(
      `/api/organizations/${organizationId}/timesheets?userId=${tech.user.id}`,
    );
    expect(hiddenWeek.status).toBe(404);

    const hiddenEntry = await otherAgent.get(
      `/api/organizations/${organizationId}/timesheets/entries/${created.body.id}`,
    );
    expect(hiddenEntry.status).toBe(404);

    const forged = await withCsrf(
      otherAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      userId: tech.user.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '11:00',
      endTime: '12:00',
      description: 'Cannot write another technician timesheet.',
    });
    expect(forged.status).toBe(404);

    const ownerWeek = await agent.get(
      `/api/organizations/${organizationId}/timesheets?userId=${tech.user.id}`,
    );
    expect(ownerWeek.status).toBe(200);
    expect(ownerWeek.body.recent.some((row: { id: string }) => row.id === created.body.id)).toBe(
      true,
    );

    const { agent: sam } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const cross = await sam.get(
      `/api/organizations/${bluepeakId}/timesheets`,
    );
    expect(cross.status).toBe(404);

    const foreignId = await agent.get(
      `/api/organizations/${organizationId}/timesheets?userId=${ownerId}`,
    );
    expect(foreignId.status).toBe(200);

    const wrongOrgEntry = await sam.get(
      `/api/organizations/${northstarId}/timesheets/entries/${created.body.id}`,
    );
    expect(wrongOrgEntry.status).toBe(404);
  });

  it('lets a supervisor read authorized team time only', async () => {
    const { agent, organizationId } = await signupOrg('lead');
    const tech = await addMember(
      organizationId,
      'leadtech',
      OrganizationRole.TECHNICIAN,
    );
    const outsider = await addMember(
      organizationId,
      'outsider',
      OrganizationRole.TECHNICIAN,
    );
    const supervisor = await addMember(
      organizationId,
      'lead',
      OrganizationRole.SUPERVISOR,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Lead job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true },
    });
    const team = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams`),
    ).send({
      name: 'Timesheet Crew',
      supervisorUserId: supervisor.user.id,
    });
    expect(team.status).toBe(201);
    const added = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams/${team.body.id}/members`),
    ).send({ userId: tech.user.id });
    expect([200, 201]).toContain(added.status);

    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const entry = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '09:30',
      description: 'Team member captured time.',
    });
    expect(entry.status).toBe(201);

    const { agent: leadAgent } = await loginAs(app, supervisor.email, SEED_PASSWORD);
    const visible = await leadAgent.get(
      `/api/organizations/${organizationId}/timesheets?userId=${tech.user.id}`,
    );
    expect(visible.status).toBe(200);
    expect(visible.body.recent[0].id).toBe(entry.body.id);

    const hidden = await leadAgent.get(
      `/api/organizations/${organizationId}/timesheets?userId=${outsider.user.id}`,
    );
    expect(hidden.status).toBe(404);
  });

  it('converts clock-out to a TimeEntry once and stays idempotent on retry', async () => {
    const { agent, organizationId } = await signupOrg('clock');
    const tech = await addMember(
      organizationId,
      'clock',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Clock job');
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/dispatch`),
    ).send({});
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: false },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const inn = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id });
    expect(inn.status).toBe(200);

    const out = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-out`),
    ).send({});
    expect(out.status).toBe(200);

    const retry = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-out`),
    ).send({});
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(out.body.id);

    const prisma = prismaFrom(app);
    const rows = await prisma.timeEntry.findMany({
      where: { clockSessionId: inn.body.id, organizationId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe(TimeEntrySource.CLOCK_SESSION);
    expect(rows[0]?.type).toBe(TimeEntryType.NORMAL);
    expect(rows[0]?.status).toBe(TimeEntryStatus.DRAFT);
    expect(rows[0]?.durationMinutes).toBe(out.body.durationMinutes);

    await prisma.timeEntry.upsert({
      where: { clockSessionId: inn.body.id },
      create: {
        organizationId,
        userId: tech.user.id,
        jobId: job.id,
        clockSessionId: inn.body.id,
        workDate: rows[0]!.workDate,
        startedAt: rows[0]!.startedAt,
        endedAt: rows[0]!.endedAt,
        durationMinutes: rows[0]!.durationMinutes,
        type: TimeEntryType.NORMAL,
        source: TimeEntrySource.CLOCK_SESSION,
        status: TimeEntryStatus.DRAFT,
      },
      update: { durationMinutes: rows[0]!.durationMinutes },
    });
    expect(
      await prisma.timeEntry.count({
        where: { clockSessionId: inn.body.id, organizationId },
      }),
    ).toBe(1);

    const week = await techAgent.get(
      `/api/organizations/${organizationId}/timesheets`,
    );
    expect(week.status).toBe(200);
    expect(week.body.recent[0].source).toBe('CLOCK');
    expect(week.body.recent[0].clockSessionId).toBe(inn.body.id);
  });

  it('is read-only when the subscription is expired', async () => {
    const { agent, organizationId } = await signupOrg('expired');
    const tech = await addMember(
      organizationId,
      'expired',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Expired job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true },
    });
    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIAL_EXPIRED,
        trialEndsAt: new Date(Date.now() - 4 * 86400000),
        graceEndsAt: new Date(Date.now() - 86400000),
      },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const readable = await techAgent.get(
      `/api/organizations/${organizationId}/timesheets`,
    );
    expect(readable.status).toBe(200);
    const write = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '09:00',
      description: 'Should be blocked after expiry.',
    });
    expect(write.status).toBe(403);
  });
});
