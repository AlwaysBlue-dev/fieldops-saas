import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
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

describe('Job status concurrency (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signupOrg(label: string) {
    const suffix = `${Date.now()}-${label}`;
    const agent = api(app);
    const signup = await withCsrf(agent.post('/api/auth/signup')).send({
      email: `owner-${suffix}@conc.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Conc Owner ${label}`,
      organizationName: `Conc Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    const organizationId = signup.body.organization.id as string;
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: {
        requireClientSignature: false,
        requireGps: false,
        allowManualTime: true,
      },
    });
    return {
      agent,
      organizationId,
      ownerId: signup.body.user.id as string,
    };
  }

  async function addTech(organizationId: string, label: string) {
    const email = `tech-${label}-${Date.now()}@conc.fieldops.test`;
    const user = await prismaFrom(app).user.create({
      data: {
        email,
        fullName: `Tech ${label}`,
        passwordHash: await hash(SEED_PASSWORD, 4),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    await prismaFrom(app).organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role: OrganizationRole.TECHNICIAN,
        status: MembershipStatus.ACTIVE,
      },
    });
    return user;
  }

  async function createScheduledJob(
    agent: ReturnType<typeof api>,
    organizationId: string,
    techId: string,
    title: string,
  ) {
    const prisma = prismaFrom(app);
    const client = await prisma.client.create({
      data: { organizationId, name: `${title} Client` },
    });
    const site = await prisma.site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: 'Site',
        addressLine1: '1 Conc Way',
        city: 'Chicago',
        country: 'US',
      },
    });
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs`),
    ).send({
      title,
      clientId: client.id,
      siteId: site.id,
      jobType: 'SERVICE_CALL',
      priority: 'NORMAL',
      scheduledStart: new Date(Date.now() + 3_600_000).toISOString(),
      expectedFinish: new Date(Date.now() + 7_200_000).toISOString(),
      requireClientSignOff: false,
      technicianUserIds: [techId],
    });
    if (created.status !== 201) {
      throw new Error(
        `create job failed: ${created.status} ${JSON.stringify(created.body)}`,
      );
    }
    const scheduled = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/jobs/${created.body.id}/schedule`,
      ),
    ).send({
      scheduledStart: created.body.scheduledStart,
      expectedFinish: created.body.expectedFinish,
      technicianUserIds: [techId],
      confirmOverlap: true,
    });
    expect(scheduled.status).toBe(200);
    return scheduled.body as { id: string; status: string };
  }

  it('rejects concurrent cancel vs cancel', async () => {
    const { agent, organizationId } = await signupOrg('cancel');
    const tech = await addTech(organizationId, 'cancel');
    const job = await createScheduledJob(
      agent,
      organizationId,
      tech.id,
      'Double cancel',
    );

    const [a, b] = await Promise.all([
      withCsrf(
        agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/cancel`),
      ).send({ reason: 'First' }),
      withCsrf(
        agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/cancel`),
      ).send({ reason: 'Second' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
    const row = await prismaFrom(app).job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(row.status).toBe(JobStatus.CANCELLED);
  });

  it('rejects cancel vs dispatch race (one wins)', async () => {
    const { agent, organizationId } = await signupOrg('race-cd');
    const tech = await addTech(organizationId, 'race-cd');
    const job = await createScheduledJob(
      agent,
      organizationId,
      tech.id,
      'Cancel dispatch',
    );

    const [cancel, dispatch] = await Promise.all([
      withCsrf(
        agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/cancel`),
      ).send({ reason: 'Abort' }),
      withCsrf(
        agent.post(
          `/api/organizations/${organizationId}/jobs/${job.id}/dispatch`,
        ),
      ).send({}),
    ]);
    const ok = [cancel, dispatch].filter((r) => r.status === 200);
    const conflict = [cancel, dispatch].filter(
      (r) => r.status === 409 || r.status === 400,
    );
    expect(ok).toHaveLength(1);
    expect(conflict.length).toBeGreaterThanOrEqual(1);
    const row = await prismaFrom(app).job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect([JobStatus.CANCELLED, JobStatus.DISPATCHED]).toContain(row.status);
  });

  it('rejects submit vs cancel race', async () => {
    const { agent, organizationId } = await signupOrg('sub-can');
    const tech = await addTech(organizationId, 'sub-can');
    const job = await createScheduledJob(
      agent,
      organizationId,
      tech.id,
      'Submit cancel',
    );
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/dispatch`),
    ).send({});
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/start`),
    ).send({});
    await withCsrf(
      agent.patch(
        `/api/organizations/${organizationId}/jobs/${job.id}/completion`,
      ),
    ).send({
      workPerformed: 'Completed the assigned field work.',
      outcome: 'COMPLETED',
    });

    const [submit, cancel] = await Promise.all([
      withCsrf(
        agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
      ).send({}),
      withCsrf(
        agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/cancel`),
      ).send({ reason: 'Stop' }),
    ]);
    const ok = [submit, cancel].filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    const row = await prismaFrom(app).job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect([JobStatus.PENDING_APPROVAL, JobStatus.CANCELLED]).toContain(
      row.status,
    );
  });

  it('rejects return vs approve race', async () => {
    const { agent, organizationId } = await signupOrg('ret-appr');
    const tech = await addTech(organizationId, 'ret-appr');
    const job = await createScheduledJob(
      agent,
      organizationId,
      tech.id,
      'Return approve',
    );
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/dispatch`),
    ).send({});
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/start`),
    ).send({});
    await withCsrf(
      agent.patch(
        `/api/organizations/${organizationId}/jobs/${job.id}/completion`,
      ),
    ).send({
      workPerformed: 'Completed the assigned field work.',
      outcome: 'COMPLETED',
    });
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});

    const [complete, ret] = await Promise.all([
      withCsrf(
        agent.post(
          `/api/organizations/${organizationId}/jobs/${job.id}/complete`,
        ),
      ).send({}),
      withCsrf(
        agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/return`),
      ).send({ reason: 'Needs photos' }),
    ]);
    const ok = [complete, ret].filter((r) => r.status === 200);
    const lost = [complete, ret].filter(
      (r) => r.status === 409 || r.status === 400,
    );
    expect(ok).toHaveLength(1);
    expect(lost.length).toBeGreaterThanOrEqual(1);
    const row = await prismaFrom(app).job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect([JobStatus.COMPLETED, JobStatus.RETURNED]).toContain(row.status);
  });

  it('rejects stale expected-state dispatch after cancel', async () => {
    const { agent, organizationId } = await signupOrg('stale');
    const tech = await addTech(organizationId, 'stale');
    const job = await createScheduledJob(
      agent,
      organizationId,
      tech.id,
      'Stale dispatch',
    );
    const cancel = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/cancel`),
    ).send({ reason: 'Cancelled first' });
    expect(cancel.status).toBe(200);
    const dispatch = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/jobs/${job.id}/dispatch`,
      ),
    ).send({});
    expect([400, 409]).toContain(dispatch.status);
  });
});
