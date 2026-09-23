import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  JobPriority,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  SubscriptionStatus,
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
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Technician My Day (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let northstarJobId = '';
  let caseyJobId = '';
  let bluepeakJobId = '';

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
    caseyJobId = (
      await prisma.job.findFirstOrThrow({
        where: { organizationId: northstarId, jobNumber: 'NS-1002' },
      })
    ).id;
    bluepeakJobId = (
      await prisma.job.findFirstOrThrow({
        where: { organizationId: bluepeakId },
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
      email: `owner-${suffix}@myday.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Day Owner ${label}`,
      organizationName: `Day Co ${suffix}`,
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

  async function addClientSite(organizationId: string, label: string) {
    const prisma = prismaFrom(app);
    const client = await prisma.client.create({
      data: {
        organizationId,
        name: `Client ${label}`,
        phone: '+1-312-555-0100',
      },
    });
    const site = await prisma.site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: `Site ${label}`,
        addressLine1: '200 W Madison',
        city: 'Chicago',
        region: 'IL',
        postalCode: '60606',
        country: 'US',
        latitude: '41.8820000',
        longitude: '-87.6370000',
        siteContactName: 'Pat Site',
        siteContactPhone: '+1-312-555-0199',
      },
    });
    return { client, site };
  }

  async function addTechnician(organizationId: string, label: string) {
    const prisma = prismaFrom(app);
    const email = `tech-${label}-${Date.now()}@myday.fieldops.test`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `Tech ${label}`,
        passwordHash: await hash(SEED_PASSWORD, 4),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role: OrganizationRole.TECHNICIAN,
        status: MembershipStatus.ACTIVE,
      },
    });
    return { user, email };
  }

  async function dispatchedJob(
    agent: ReturnType<typeof api>,
    organizationId: string,
    ownerId: string,
    technicianUserId: string,
    title: string,
  ) {
    const { client, site } = await addClientSite(organizationId, title);
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs`),
    ).send({
      title,
      clientId: client.id,
      siteId: site.id,
      jobType: 'SERVICE_CALL',
      priority: JobPriority.HIGH,
      technicianUserIds: [technicianUserId],
      supervisorUserId: ownerId,
      scheduledStart: new Date().toISOString(),
      expectedFinish: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      scope: 'Replace ballast and confirm lighting.',
      requireClientSignOff: true,
    });
    expect(created.status).toBe(201);
    const scheduled = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/schedule`),
    ).send({
      scheduledStart: created.body.scheduledStart,
      expectedFinish: created.body.expectedFinish,
      technicianUserIds: [technicianUserId],
      confirmOverlap: true,
    });
    expect(scheduled.status).toBe(200);
    const dispatched = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/dispatch`),
    ).send({});
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.status).toBe(JobStatus.DISPATCHED);
    return dispatched.body as { id: string; status: string };
  }

  it('shows a technician only their assigned work and clock status', async () => {
    const { agent: sam } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const day = await sam.get(`/api/organizations/${northstarId}/my-day`);
    expect(day.status).toBe(200);
    expect(day.body.clock.status).toBe('CLOCKED_IN');
    expect(day.body.currentJob?.id).toBe(northstarJobId);
    expect(day.body.currentJob?.jobNumber).toBe('NS-1001');
    expect(
      [day.body.currentJob, ...day.body.upcomingJobs].some(
        (job: { id: string } | null) => job?.id === caseyJobId,
      ),
    ).toBe(false);
    expect(day.body.shift.timeZone).toBe('America/Chicago');

    await prismaFrom(app).job.update({
      where: { id: caseyJobId },
      data: {
        scheduledStart: new Date(),
        expectedFinish: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
    const { agent: casey } = await loginAs(
      app,
      'casey.nguyen@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const caseyDay = await casey.get(`/api/organizations/${northstarId}/my-day`);
    expect(caseyDay.status).toBe(200);
    expect(caseyDay.body.clock.status).toBe('CLOCKED_OUT');
    const caseyIds = [
      caseyDay.body.currentJob?.id,
      ...caseyDay.body.upcomingJobs.map((job: { id: string }) => job.id),
    ];
    expect(caseyIds).toContain(caseyJobId);
    expect(caseyIds).not.toContain(northstarJobId);

    const { agent: jordan } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const office = await jordan.get(`/api/organizations/${northstarId}/my-day`);
    expect(office.status).toBe(200);
    expect(office.body.currentJob).toBeNull();
    expect(office.body.upcomingJobs).toEqual([]);
  });

  it('rejects cross-tenant my-day and job mutations', async () => {
    const { agent: sam } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const foreignDay = await sam.get(`/api/organizations/${bluepeakId}/my-day`);
    expect(foreignDay.status).toBe(404);

    const sneak = await withCsrf(
      sam.post(`/api/organizations/${northstarId}/jobs/${bluepeakJobId}/work-logs`),
    ).send({ body: 'Should not land' });
    expect(sneak.status).toBe(404);
    expect(sneak.body).not.toHaveProperty('body');
  });

  it('walks clock and field actions with role and GPS rules', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('clock');
    const tech = await addTechnician(organizationId, 'clock');
    const other = await addTechnician(organizationId, 'other');
    const job = await dispatchedJob(
      agent,
      organizationId,
      ownerId,
      tech.user.id,
      'Lobby lighting',
    );
    const otherJob = await dispatchedJob(
      agent,
      organizationId,
      ownerId,
      other.user.id,
      'Other tech job',
    );

    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const emptyClock = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-out`),
    ).send({});
    expect(emptyClock.status).toBe(400);

    const foreignClock = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: otherJob.id, latitude: 41.88, longitude: -87.63 });
    expect(foreignClock.status).toBe(404);

    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: true },
    });
    const missingGps = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id });
    expect(missingGps.status).toBe(400);

    const clockIn = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id, latitude: 41.882, longitude: -87.637, accuracyMeters: 12 });
    expect(clockIn.status).toBe(200);
    expect(clockIn.body.status).toBe('OPEN');
    expect(clockIn.body.jobId).toBe(job.id);
    expect(clockIn.body.clockInAt).toBeTruthy();

    const started = await techAgent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}`,
    );
    expect(started.body.status).toBe(JobStatus.IN_PROGRESS);

    const again = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id, latitude: 41.882, longitude: -87.637 });
    expect(again.status).toBe(409);

    const log = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/work-logs`),
    ).send({ body: 'Ballast swapped. Lights stable.' });
    expect(log.status).toBe(201);

    const material = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/materials`),
    ).send({ name: 'LED ballast', quantity: 1, unit: 'ea' });
    expect(material.status).toBe(201);

    const photo = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/photos`),
    ).send({
      fileName: 'panel.jpg',
      mimeType: 'image/png',
      contentBase64: PNG_1X1,
    });
    expect(photo.status).toBe(201);
    expect(photo.body.type).toBe('PHOTO');

    const sign = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/signatures`),
    ).send({
      signerName: 'Priya Shah',
      signerTitle: 'Facilities',
      imageBase64: PNG_1X1,
    });
    expect(sign.status).toBe(201);

    const { agent: otherAgent } = await loginAs(app, other.email, SEED_PASSWORD);
    const otherLog = await withCsrf(
      otherAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/work-logs`),
    ).send({ body: 'Not my job' });
    expect(otherLog.status).toBe(404);

    const clockOut = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-out`),
    ).send({ latitude: 41.882, longitude: -87.637 });
    expect(clockOut.status).toBe(200);
    expect(clockOut.body.status).toBe('CLOSED');
    expect(typeof clockOut.body.durationMinutes).toBe('number');

    const day = await techAgent.get(`/api/organizations/${organizationId}/my-day`);
    expect(day.status).toBe(200);
    expect(day.body.clock.status).toBe('CLOCKED_OUT');
    expect(day.body.currentJob?.id).toBe(job.id);
    expect(day.body.currentJob?.actions.canSignOff).toBe(false);
    expect(day.body.currentJob?.siteContact?.name).toBe('Pat Site');
    expect(day.body.currentJob?.navigationUrl).toContain('41.882');
  });

  it('allows my-day reads on expired trial but blocks clock mutations', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('expired');
    const tech = await addTechnician(organizationId, 'expired');
    await dispatchedJob(agent, organizationId, ownerId, tech.user.id, 'Expired day');
    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: new Date(Date.now() - 20 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 6 * 86_400_000),
        graceEndsAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const day = await techAgent.get(`/api/organizations/${organizationId}/my-day`);
    expect(day.status).toBe(200);
    const clock = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ latitude: 41.88, longitude: -87.63 });
    expect(clock.status).toBe(403);
    expect(clock.body.error).toBe('SUBSCRIPTION_READ_ONLY');
  });
});
