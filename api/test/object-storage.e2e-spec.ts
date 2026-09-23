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
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Object storage isolation (e2e)', () => {
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
      email: `owner-${suffix}@files.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Files Owner ${label}`,
      organizationName: `Files Co ${suffix}`,
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
    const email = `tech-${label}-${Date.now()}@files.fieldops.test`;
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

  async function inProgressJob(
    agent: ReturnType<typeof api>,
    organizationId: string,
    technicianUserId: string,
    title: string,
    extras: Record<string, unknown> = {},
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
        addressLine1: '100 West Madison',
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
      priority: JobPriority.NORMAL,
      technicianUserIds: [technicianUserId],
      scheduledStart: new Date().toISOString(),
      expectedFinish: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      requireClientSignOff: false,
      ...extras,
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
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/dispatch`),
    ).send({});
    const started = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/start`),
    ).send({});
    expect(started.status).toBe(200);
    return started.body as { id: string };
  }

  it('blocks cross-tenant metadata, URLs, uploads, and deletes', async () => {
    const a = await signupOrg('iso-a');
    const b = await signupOrg('iso-b');
    const techA = await addTechnician(a.organizationId, 'a');
    const techB = await addTechnician(b.organizationId, 'b');
    const jobA = await inProgressJob(a.agent, a.organizationId, techA.user.id, 'A job');
    const jobB = await inProgressJob(b.agent, b.organizationId, techB.user.id, 'B job');
    const { agent: agentA } = await loginAs(app, techA.email, SEED_PASSWORD);
    const { agent: agentB } = await loginAs(app, techB.email, SEED_PASSWORD);

    const uploaded = await withCsrf(
      agentB.post(`/api/organizations/${b.organizationId}/jobs/${jobB.id}/files`),
    )
      .field('category', 'PHOTO')
      .attach('file', PNG_1X1, { filename: 'site.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.objectKey).toBeUndefined();
    expect(uploaded.body.downloadUrl).toBeTruthy();

    const sneakMeta = await agentA.get(
      `/api/organizations/${a.organizationId}/files/${uploaded.body.id}`,
    );
    expect(sneakMeta.status).toBe(404);

    const sneakAccess = await agentA.get(
      `/api/organizations/${a.organizationId}/jobs/${jobA.id}/files/${uploaded.body.id}/access`,
    );
    expect(sneakAccess.status).toBe(404);
    expect(JSON.stringify(sneakAccess.body)).not.toMatch(/X-Amz-Signature|localhost:9000/);

    const sneakContent = await agentA.get(
      `/api/organizations/${a.organizationId}/jobs/${jobA.id}/files/${uploaded.body.id}/content`,
    );
    expect(sneakContent.status).toBe(404);

    const sneakOrg = await agentA.get(
      `/api/organizations/${b.organizationId}/jobs/${jobB.id}/files/${uploaded.body.id}/access`,
    );
    expect(sneakOrg.status).toBe(404);

    const sneakUpload = await withCsrf(
      agentA.post(`/api/organizations/${b.organizationId}/jobs/${jobB.id}/files`),
    )
      .field('category', 'PHOTO')
      .attach('file', PNG_1X1, { filename: 'steal.png', contentType: 'image/png' });
    expect(sneakUpload.status).toBe(404);

    const sneakDelete = await withCsrf(
      agentA.delete(
        `/api/organizations/${b.organizationId}/jobs/${jobB.id}/files/${uploaded.body.id}`,
      ),
    );
    expect(sneakDelete.status).toBe(404);

    const own = await agentB.get(
      `/api/organizations/${b.organizationId}/jobs/${jobB.id}/files/${uploaded.body.id}/content`,
    );
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toMatch(/image\/png/);

    const access = await agentB.get(
      `/api/organizations/${b.organizationId}/jobs/${jobB.id}/files/${uploaded.body.id}/access`,
    );
    expect(access.status).toBe(200);
    expect(access.body.expiresInSeconds).toBeGreaterThanOrEqual(30);
    expect(access.body.expiresInSeconds).toBeLessThanOrEqual(3600);
    expect(access.body.objectKey).toBeUndefined();
    expect(JSON.stringify(access.body)).not.toMatch(/"objectKey"/);

    const anon = await api(app).get(
      `/api/organizations/${b.organizationId}/jobs/${jobB.id}/files/${uploaded.body.id}/access`,
    );
    expect(anon.status).toBe(401);
  });

  it('rejects invalid MIME, oversized files, and missing objects', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('mime');
    const job = await inProgressJob(agent, organizationId, ownerId, 'MIME job');

    const exe = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/files`),
    )
      .field('category', 'PHOTO')
      .attach('file', Buffer.from('MZ executable'), {
        filename: 'payload.exe',
        contentType: 'image/jpeg',
      });
    expect(exe.status).toBe(400);

    const huge = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(8 * 1024 * 1024 + 32),
    ]);
    const oversized = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/files`),
    )
      .field('category', 'PHOTO')
      .attach('file', huge, { filename: 'huge.jpg', contentType: 'image/jpeg' });
    expect(oversized.status).toBe(400);

    const prisma = prismaFrom(app);
    const ghost = await prisma.jobFile.create({
      data: {
        organizationId,
        jobId: job.id,
        objectKey: `organizations/${organizationId}/jobs/${job.id}/photos/${crypto.randomUUID()}.jpg`,
        originalName: 'missing.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12n,
        type: 'PHOTO',
        uploadedById: ownerId,
      },
    });
    const missing = await agent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}/files/${ghost.id}/content`,
    );
    expect(missing.status).toBe(404);
  });

  it('requires a persisted signature when configured and does not activate from a frontend flag', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('sig');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireClientSignature: true },
    });
    const job = await inProgressJob(agent, organizationId, ownerId, 'Sign job', {
      requireClientSignOff: true,
    });
    await withCsrf(
      agent.patch(`/api/organizations/${organizationId}/jobs/${job.id}/completion`),
    ).send({
      workPerformed: 'Isolated supply and completed panel inspection.',
      outcome: 'COMPLETED',
    });
    const blocked = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({ signatureComplete: true });
    expect(blocked.status).toBe(400);

    const signed = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/sign-off`),
    ).send({
      representativeName: 'Alex Rivera',
      representativeRole: 'Facilities',
      clientAccepted: true,
      imageBase64: PNG_1X1.toString('base64'),
    });
    expect(signed.status).toBe(201);
    expect(signed.body.representativeName).toBe('Alex Rivera');

    const submitted = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe(JobStatus.PENDING_APPROVAL);

    const locked = await withCsrf(
      agent.delete(
        `/api/organizations/${organizationId}/jobs/${job.id}/files/${signed.body.id}`,
      ),
    );
    expect(locked.status).toBe(400);
  });

  it('blocks uploads when the subscription is expired', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('expired');
    const job = await inProgressJob(agent, organizationId, ownerId, 'Expired job');
    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIAL_EXPIRED,
        trialEndsAt: new Date(Date.now() - 4 * 86400000),
        graceEndsAt: new Date(Date.now() - 86400000),
      },
    });
    const upload = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/files`),
    )
      .field('category', 'PHOTO')
      .attach('file', PNG_1X1, { filename: 'late.png', contentType: 'image/png' });
    expect(upload.status).toBe(403);
  });
});
