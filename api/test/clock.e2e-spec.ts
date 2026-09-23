import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  JobPriority,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
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

describe('Clock and GPS evidence (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let northstarSessionId = '';

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
    northstarSessionId = (
      await prisma.clockSession.findFirstOrThrow({
        where: { organizationId: northstarId, status: 'OPEN' },
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
      email: `owner-${suffix}@clock.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Clock Owner ${label}`,
      organizationName: `Clock Co ${suffix}`,
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

  async function addTechnician(organizationId: string, label: string) {
    const prisma = prismaFrom(app);
    const email = `tech-${label}-${Date.now()}@clock.fieldops.test`;
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
    const dispatched = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/dispatch`),
    ).send({});
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.status).toBe(JobStatus.DISPATCHED);
    return dispatched.body as { id: string };
  }

  it('prevents two active sessions for the same technician', async () => {
    const { organizationId } = await signupOrg('race');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: false },
    });
    const tech = await addTechnician(organizationId, 'race');
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const [first, second] = await Promise.all([
      withCsrf(techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`)).send({}),
      withCsrf(techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`)).send({}),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('enforces GPS when required and accepts optional GPS when not', async () => {
    const { agent, organizationId } = await signupOrg('gps');
    const tech = await addTechnician(organizationId, 'gps');
    const job = await dispatchedJob(agent, organizationId, tech.user.id, 'GPS job');
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);

    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: true, gpsReviewDistanceMeters: 250 },
    });
    const missing = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id });
    expect(missing.status).toBe(400);

    const half = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id, latitude: 41.882 });
    expect(half.status).toBe(400);

    const invalid = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id, latitude: 100, longitude: -87.637 });
    expect(invalid.status).toBe(400);

    const near = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({
      jobId: job.id,
      latitude: 41.8827,
      longitude: -87.637,
      accuracyMeters: 18,
      clientOccurredAt: '2020-01-01T00:00:00.000Z',
    });
    expect(near.status).toBe(200);
    expect(near.body.clockInAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(near.body.clockInEvidence.locationStatus).toBe('NEAR_SITE');
    expect(near.body.clockInEvidence.distanceFromSiteMeters).toBeLessThan(250);
    expect(near.body.clockInEvidence.mapsUrl).toContain('41.8827');

    await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-out`),
    ).send({ latitude: 41.882, longitude: -87.637, accuracyMeters: 12 });

    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: false },
    });
    const optional = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id });
    expect(optional.status).toBe(200);
    expect(optional.body.clockInEvidence.locationStatus).toBe('NO_GPS');
  });

  it('classifies far and low-accuracy clocks as review, not misconduct', async () => {
    const { agent, organizationId } = await signupOrg('review');
    const tech = await addTechnician(organizationId, 'review');
    const job = await dispatchedJob(agent, organizationId, tech.user.id, 'Far job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: true, gpsReviewDistanceMeters: 250 },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const far = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({
      jobId: job.id,
      latitude: 41.8945,
      longitude: -87.637,
      accuracyMeters: 23,
    });
    expect(far.status).toBe(200);
    expect(far.body.clockInEvidence.locationStatus).toBe('LOCATION_REVIEW');
    expect(far.body.clockInEvidence.distanceFromSiteMeters).toBeGreaterThan(1000);

    await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-out`),
    ).send({ latitude: 41.8945, longitude: -87.637, accuracyMeters: 400 });
    const closed = await techAgent.get(
      `/api/organizations/${organizationId}/clock-sessions/${far.body.id}`,
    );
    expect(closed.status).toBe(200);
    expect(closed.body.clockOutEvidence.locationStatus).toBe('LOW_ACCURACY');
  });

  it('writes TimeEntry in the same clock-out transaction and keeps tenant isolation', async () => {
    const { agent, organizationId } = await signupOrg('entry');
    const tech = await addTechnician(organizationId, 'entry');
    const other = await addTechnician(organizationId, 'other');
    const job = await dispatchedJob(agent, organizationId, tech.user.id, 'Entry job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: false },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const inn = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-in`),
    ).send({ jobId: job.id, latitude: 41.882, longitude: -87.637 });
    expect(inn.status).toBe(200);
    const out = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/my-day/clock-out`),
    ).send({ latitude: 41.882, longitude: -87.637 });
    expect(out.status).toBe(200);
    expect(out.body.status).toBe('CLOSED');
    expect(typeof out.body.durationMinutes).toBe('number');

    const entry = await prismaFrom(app).timeEntry.findFirst({
      where: { clockSessionId: inn.body.id, organizationId },
    });
    expect(entry?.startedAt.toISOString()).toBe(inn.body.clockInAt);
    expect(entry?.endedAt?.toISOString()).toBe(out.body.clockOutAt);
    expect(entry?.source).toBe('CLOCK_SESSION');

    const { agent: otherAgent } = await loginAs(app, other.email, SEED_PASSWORD);
    const hidden = await otherAgent.get(
      `/api/organizations/${organizationId}/clock-sessions/${inn.body.id}`,
    );
    expect(hidden.status).toBe(404);

    const { agent: sam } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const day = await sam.get(`/api/organizations/${northstarId}/my-day`);
    expect(day.status).toBe(200);
    expect(day.body.shift.timeZone).toBe('America/Chicago');
    expect(day.body.clock.session.clockInAt.endsWith('Z')).toBe(true);
    expect(day.body.settings.gpsReviewDistanceMeters).toBe(250);

    const foreign = await sam.get(
      `/api/organizations/${bluepeakId}/clock-sessions/${northstarSessionId}`,
    );
    expect(foreign.status).toBe(404);

    const inspect = await sam.get(
      `/api/organizations/${northstarId}/clock-sessions/${northstarSessionId}`,
    );
    expect(inspect.status).toBe(200);
    expect(inspect.body.clockInEvidence.mapsUrl).toContain('maps.google.com');

    const { agent: jordan } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const office = await jordan.get(
      `/api/organizations/${northstarId}/clock-sessions/${northstarSessionId}`,
    );
    expect(office.status).toBe(200);
    expect(office.body.technician.fullName).toBe('Sam Ortega');
  });
});
