import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_JOB_ASSIGNED,
  AUDIT_JOB_SCHEDULED,
} from '../src/common/constants.js';
import { zonedLocalToUtc } from '../src/common/timezone.js';
import {
  JobPriority,
  JobStatus,
  OrganizationRole,
  SubscriptionStatus,
} from '../src/generated/prisma/client.js';
import {
  api,
  createTestApp,
  loginAs,
  prismaFrom,
  withCsrf,
} from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Schedule and dispatch (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let northstarJobId = '';
  let bluepeakJobId = '';
  let caseyId = '';

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
    northstarJobId = (
      await prisma.job.findFirstOrThrow({
        where: { organizationId: northstarId, jobNumber: 'NS-1001' },
      })
    ).id;
    bluepeakJobId = (
      await prisma.job.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;
    caseyId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'casey.nguyen@northstar.fieldops.local' },
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
      email: `owner-${suffix}@schedule.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Schedule Owner ${label}`,
      organizationName: `Dispatch Co ${suffix}`,
      timezone: 'America/Chicago',
    });
    expect(signup.status).toBe(201);
    return {
      agent,
      organizationId: signup.body.organization.id as string,
      ownerId: signup.body.user.id as string,
    };
  }

  async function createBareJob(
    organizationId: string,
    jobNumber: string,
    title = 'Dispatch fixture',
  ) {
    const prisma = prismaFrom(app);
    const client = await prisma.client.create({
      data: {
        organizationId,
        name: `Client ${jobNumber}`,
      },
    });
    const site = await prisma.site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: `Site ${jobNumber}`,
        city: 'Chicago',
        country: 'US',
      },
    });
    return prisma.job.create({
      data: {
        organizationId,
        jobNumber,
        title,
        clientId: client.id,
        siteId: site.id,
        jobType: 'SERVICE_CALL',
        priority: JobPriority.NORMAL,
        status: JobStatus.DRAFT,
      },
    });
  }

  it('returns an org-timezone day board with live seed jobs', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const board = await agent.get(
      `/api/organizations/${northstarId}/schedule?range=day`,
    );
    expect(board.status).toBe(200);
    expect(board.body.timezone).toBe('America/Chicago');
    expect(board.body.range).toBe('day');
    expect(board.body.lanes.some((lane: { kind: string }) => lane.kind === 'TECHNICIAN')).toBe(
      true,
    );
    const numbers = board.body.lanes.flatMap((lane: { jobs: Array<{ jobNumber: string }> }) =>
      lane.jobs.map((job) => job.jobNumber),
    );
    expect(numbers).toEqual(expect.arrayContaining(['NS-1001', 'NS-1002']));
    expect(numbers).not.toContain('BP-1001');
  });

  it('schedules and assigns a job, then warns on technician overlap', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('overlap');
    const prisma = prismaFrom(app);
    const member = await prisma.organizationMember.updateMany({
      where: { organizationId, userId: ownerId },
      data: { role: OrganizationRole.OWNER },
    });
    expect(member.count).toBe(1);

    const first = await createBareJob(organizationId, `SC-${Date.now()}-A`);
    const second = await createBareJob(organizationId, `SC-${Date.now()}-B`);
    const start = zonedLocalToUtc('2026-03-10', '09:00:00', 'America/Chicago');
    const finish = zonedLocalToUtc('2026-03-10', '11:00:00', 'America/Chicago');

    const scheduled = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${first.id}/schedule`),
    ).send({
      scheduledStart: start.toISOString(),
      expectedFinish: finish.toISOString(),
      technicianUserIds: [ownerId],
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.status).toBe(JobStatus.SCHEDULED);
    expect(scheduled.body.technicians[0].userId).toBe(ownerId);

    const conflict = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${second.id}/schedule`),
    ).send({
      scheduledStart: zonedLocalToUtc('2026-03-10', '10:00:00', 'America/Chicago').toISOString(),
      expectedFinish: zonedLocalToUtc('2026-03-10', '12:00:00', 'America/Chicago').toISOString(),
      technicianUserIds: [ownerId],
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('SCHEDULE_CONFLICT');
    expect(conflict.body.conflicts[0].jobNumber).toBe(first.jobNumber);

    const overridden = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${second.id}/schedule`),
    ).send({
      scheduledStart: zonedLocalToUtc('2026-03-10', '10:00:00', 'America/Chicago').toISOString(),
      expectedFinish: zonedLocalToUtc('2026-03-10', '12:00:00', 'America/Chicago').toISOString(),
      technicianUserIds: [ownerId],
      confirmOverlap: true,
    });
    expect(overridden.status).toBe(200);

    const actions = (
      await prisma.auditLog.findMany({
        where: { organizationId, entityId: first.id },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([AUDIT_JOB_SCHEDULED, AUDIT_JOB_ASSIGNED]),
    );

    const day = await agent.get(
      `/api/organizations/${organizationId}/schedule?date=2026-03-10&range=day`,
    );
    expect(day.status).toBe(200);
    expect(day.body.from).toBe('2026-03-10T05:00:00.000Z');
    const onBoard = day.body.lanes.flatMap((lane: { jobs: Array<{ id: string }> }) =>
      lane.jobs.map((job) => job.id),
    );
    expect(onBoard).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it('filters technicians to their own schedule and blocks mutations', async () => {
    const { agent } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const board = await agent.get(
      `/api/organizations/${northstarId}/schedule?range=day`,
    );
    expect(board.status).toBe(200);
    expect(board.body.canMutate).toBe(false);
    const ids = board.body.lanes.flatMap((lane: { jobs: Array<{ id: string }> }) =>
      lane.jobs.map((job) => job.id),
    );
    expect(ids).toContain(northstarJobId);
    const caseyJob = await prismaFrom(app).job.findFirstOrThrow({
      where: { organizationId: northstarId, jobNumber: 'NS-1002' },
    });
    expect(ids).not.toContain(caseyJob.id);

    const hidden = await agent.get(
      `/api/organizations/${northstarId}/jobs/${caseyJob.id}`,
    );
    expect(hidden.status).toBe(404);

    const mutate = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/jobs/${northstarJobId}/schedule`),
    ).send({ scheduledStart: new Date().toISOString() });
    expect(mutate.status).toBe(403);

    const filtered = await agent.get(
      `/api/organizations/${northstarId}/schedule?technicianId=${caseyId}`,
    );
    const filteredIds = filtered.body.lanes.flatMap(
      (lane: { jobs: Array<{ id: string }> }) => lane.jobs.map((job) => job.id),
    );
    expect(filteredIds).not.toContain(caseyJob.id);
  });

  it('lets supervisors see team jobs and not another organization', async () => {
    const { agent } = await loginAs(
      app,
      'riley.chen@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const board = await agent.get(`/api/organizations/${northstarId}/schedule`);
    expect(board.status).toBe(200);
    expect(board.body.canMutate).toBe(true);
    const numbers = board.body.lanes.flatMap((lane: { jobs: Array<{ jobNumber: string }> }) =>
      lane.jobs.map((job) => job.jobNumber),
    );
    expect(numbers).toEqual(expect.arrayContaining(['NS-1001', 'NS-1002']));

    const foreignBoard = await agent.get(`/api/organizations/${bluepeakId}/schedule`);
    expect(foreignBoard.status).toBe(404);

    const foreignJob = await agent.get(
      `/api/organizations/${northstarId}/jobs/${bluepeakJobId}`,
    );
    expect(foreignJob.status).toBe(404);
    expect(foreignJob.body).not.toHaveProperty('jobNumber');

    const foreignSchedule = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/jobs/${bluepeakJobId}/schedule`),
    ).send({ scheduledStart: new Date().toISOString() });
    expect(foreignSchedule.status).toBe(404);
  });

  it('rejects expired-subscription schedule mutations while the board still reads', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('expired');
    const job = await createBareJob(organizationId, `EX-${Date.now()}`);
    const before = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/schedule`),
    ).send({
      scheduledStart: zonedLocalToUtc('2026-04-01', '08:00:00', 'America/Chicago').toISOString(),
      technicianUserIds: [ownerId],
    });
    expect(before.status).toBe(200);

    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: new Date(Date.now() - 20 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 6 * 86_400_000),
        graceEndsAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });

    const list = await agent.get(
      `/api/organizations/${organizationId}/schedule?date=2026-04-01`,
    );
    expect(list.status).toBe(200);
    expect(
      list.body.lanes.some((lane: { jobs: Array<{ id: string }> }) =>
        lane.jobs.some((item) => item.id === job.id),
      ),
    ).toBe(true);

    const mutate = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/schedule`),
    ).send({
      scheduledStart: zonedLocalToUtc('2026-04-01', '13:00:00', 'America/Chicago').toISOString(),
    });
    expect(mutate.status).toBe(403);
    expect(mutate.body.error).toBe('SUBSCRIPTION_READ_ONLY');
  });
});
