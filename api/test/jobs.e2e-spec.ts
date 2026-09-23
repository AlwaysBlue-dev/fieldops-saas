import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_JOB_CREATED,
  AUDIT_JOB_DISPATCHED,
} from '../src/common/constants.js';
import { formatJobNumber } from '../src/organizations/job-numbering.js';
import {
  JobPriority,
  JobStatus,
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

describe('Job cards (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let northstarJobId = '';
  let bluepeakJobId = '';
  let harborviewId = '';
  let harborviewSiteId = '';
  let bakerySiteId = '';

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
    const harborview = await prisma.client.findFirstOrThrow({
      where: { organizationId: northstarId, name: 'Harborview Clinic' },
    });
    harborviewId = harborview.id;
    harborviewSiteId = (
      await prisma.site.findFirstOrThrow({
        where: { organizationId: northstarId, clientId: harborview.id },
      })
    ).id;
    bakerySiteId = (
      await prisma.site.findFirstOrThrow({
        where: { organizationId: northstarId, name: 'Storefront Kitchen' },
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
      email: `owner-${suffix}@jobs.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Jobs Owner ${label}`,
      organizationName: `Job Co ${suffix}`,
      timezone: 'America/Chicago',
    });
    expect(signup.status).toBe(201);
    const organizationId = signup.body.organization.id as string;
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { jobNumberPrefix: 'NSE-' },
    });
    return {
      agent,
      organizationId,
      ownerId: signup.body.user.id as string,
    };
  }

  async function addClientSite(organizationId: string, label: string) {
    const prisma = prismaFrom(app);
    const client = await prisma.client.create({
      data: {
        organizationId,
        name: `Client ${label}`,
      },
    });
    const site = await prisma.site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: `Site ${label}`,
        city: 'Chicago',
        country: 'US',
      },
    });
    return { client, site };
  }

  it('allocates unique job numbers under concurrent creates', async () => {
    const { agent, organizationId } = await signupOrg('numbers');
    const { client, site } = await addClientSite(organizationId, 'num');
    const body = {
      title: 'Concurrent card',
      clientId: client.id,
      siteId: site.id,
      jobType: 'SERVICE_CALL',
      priority: JobPriority.NORMAL,
    };
    const [first, second] = await Promise.all([
      withCsrf(agent.post(`/api/organizations/${organizationId}/jobs`)).send(body),
      withCsrf(agent.post(`/api/organizations/${organizationId}/jobs`)).send({
        ...body,
        title: 'Concurrent card B',
      }),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const numbers = [first.body.jobNumber, second.body.jobNumber].sort();
    expect(numbers).toEqual(['NSE-000001', 'NSE-000002']);
    expect(formatJobNumber('NSE-', 1)).toBe('NSE-000001');
    expect(first.body.jobNumber).not.toBe(second.body.jobNumber);
  });

  it('walks legal transitions and rejects illegal jumps', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('flow');
    const { client, site } = await addClientSite(organizationId, 'flow');
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs`),
    ).send({
      title: 'Panel upgrade',
      clientId: client.id,
      siteId: site.id,
      jobType: 'INSTALLATION',
      scheduledStart: '2026-04-02T14:00:00.000Z',
      expectedFinish: '2026-04-02T16:00:00.000Z',
      technicianUserIds: [ownerId],
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe(JobStatus.DRAFT);
    expect(created.body.jobNumber).toMatch(/^NSE-\d{6}$/);

    const illegal = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/complete`),
    ).send({});
    expect(illegal.status).toBe(400);

    const scheduled = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/schedule`),
    ).send({
      scheduledStart: '2026-04-02T14:00:00.000Z',
      expectedFinish: '2026-04-02T16:00:00.000Z',
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.status).toBe(JobStatus.SCHEDULED);

    const dispatched = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/dispatch`),
    ).send({});
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.status).toBe(JobStatus.DISPATCHED);

    const started = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/start`),
    ).send({});
    expect(started.status).toBe(200);
    expect(started.body.status).toBe(JobStatus.IN_PROGRESS);

    const submitted = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/submit`),
    ).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe(JobStatus.PENDING_APPROVAL);

    const cancelBlocked = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/cancel`),
    ).send({});
    expect(cancelBlocked.status).toBe(400);

    const returned = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/return`),
    ).send({ reason: 'Missing photos' });
    expect(returned.status).toBe(200);
    expect(returned.body.status).toBe(JobStatus.RETURNED);

    const resumed = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/resume`),
    ).send({});
    expect(resumed.status).toBe(200);

    const resubmitted = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/submit`),
    ).send({});
    expect(resubmitted.status).toBe(200);

    const completed = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/complete`),
    ).send({});
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe(JobStatus.COMPLETED);

    const actions = (
      await prismaFrom(app).auditLog.findMany({
        where: { organizationId, entityId: created.body.id },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([AUDIT_JOB_CREATED, AUDIT_JOB_DISPATCHED]),
    );
  });

  it('enforces roles, tenant isolation, search, and client-site pairing', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const listed = await agent.get(
      `/api/organizations/${northstarId}/jobs?search=Harborview&status=IN_PROGRESS`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((job: { id: string }) => job.id === northstarJobId)).toBe(
      true,
    );
    expect(
      listed.body.items.some((job: { jobNumber: string }) => job.jobNumber.startsWith('BP-')),
    ).toBe(false);

    const mismatch = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/jobs`),
    ).send({
      title: 'Bad pairing',
      clientId: harborviewId,
      siteId: bakerySiteId,
      jobType: 'SERVICE_CALL',
    });
    expect(mismatch.status).toBe(400);

    const foreign = await agent.get(
      `/api/organizations/${northstarId}/jobs/${bluepeakJobId}`,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).not.toHaveProperty('jobNumber');

    const { agent: tech } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const create = await withCsrf(
      tech.post(`/api/organizations/${northstarId}/jobs`),
    ).send({
      title: 'Tech created',
      clientId: harborviewId,
      siteId: harborviewSiteId,
      jobType: 'SERVICE_CALL',
    });
    expect(create.status).toBe(403);

    const techList = await tech.get(`/api/organizations/${northstarId}/jobs`);
    expect(techList.status).toBe(200);
    expect(
      techList.body.items.every((job: { technicians: Array<{ userId: string }> }) =>
        job.technicians.length > 0,
      ),
    ).toBe(true);
    const caseyJob = await prismaFrom(app).job.findFirstOrThrow({
      where: { organizationId: northstarId, jobNumber: 'NS-1002' },
    });
    expect(
      techList.body.items.some((job: { id: string }) => job.id === caseyJob.id),
    ).toBe(false);

    const techCancel = await withCsrf(
      tech.post(`/api/organizations/${northstarId}/jobs/${northstarJobId}/cancel`),
    ).send({ reason: 'No' });
    expect(techCancel.status).toBe(403);
  });

  it('rejects expired-subscription job mutations while lists still read', async () => {
    const { agent, organizationId } = await signupOrg('expired');
    const { client, site } = await addClientSite(organizationId, 'exp');
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs`),
    ).send({
      title: 'Trial job',
      clientId: client.id,
      siteId: site.id,
      jobType: 'MAINTENANCE',
    });
    expect(created.status).toBe(201);

    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: new Date(Date.now() - 20 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 6 * 86_400_000),
        graceEndsAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });

    const list = await agent.get(`/api/organizations/${organizationId}/jobs`);
    expect(list.status).toBe(200);
    expect(list.body.items.some((job: { id: string }) => job.id === created.body.id)).toBe(
      true,
    );

    const mutate = await withCsrf(
      agent.patch(`/api/organizations/${organizationId}/jobs/${created.body.id}`),
    ).send({ title: 'Blocked' });
    expect(mutate.status).toBe(403);
    expect(mutate.body.error).toBe('SUBSCRIPTION_READ_ONLY');
  });
});
