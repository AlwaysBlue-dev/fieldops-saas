import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_PLAN_CHANGE_REQUESTED,
  AUDIT_PLAN_CHANGED,
  AUDIT_PLAN_LIMIT_BLOCKED,
} from '../src/common/constants.js';
import {
  JobFileType,
  JobStatus,
  PlatformRole,
  SubscriptionStatus,
} from '../src/generated/prisma/client.js';
import { api, createTestApp, loginAs, prismaFrom, withCsrf } from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Plan entitlements and usage (e2e)', () => {
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
      email: `owner-${suffix}@entitlement.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Entitlement Owner ${label}`,
      organizationName: `Entitlement Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    return {
      agent,
      organizationId: signup.body.organization.id as string,
      email: `owner-${suffix}@entitlement.fieldops.test`,
    };
  }

  async function ensurePlatformAdmin() {
    const prisma = prismaFrom(app);
    await prisma.user.upsert({
      where: { email: 'platform.admin@fieldops.test' },
      update: { platformRole: PlatformRole.SUPER_ADMIN },
      create: {
        email: 'platform.admin@fieldops.test',
        fullName: 'Platform Admin',
        passwordHash: (
          await prisma.user.findUniqueOrThrow({
            where: { email: 'jordan.hale@northstar.fieldops.local' },
          })
        ).passwordHash,
        platformRole: PlatformRole.SUPER_ADMIN,
      },
    });
    return loginAs(app, 'platform.admin@fieldops.test', SEED_PASSWORD);
  }

  it('returns usage summary for the tenant and denies cross-tenant reads', async () => {
    const a = await signupOrg('usage-a');
    const b = await signupOrg('usage-b');

    const usage = await a.agent.get(`/api/organizations/${a.organizationId}/usage`);
    expect(usage.status).toBe(200);
    expect(usage.body.members).toMatchObject({
      used: 1,
      limit: expect.any(Number),
    });
    expect(usage.body.storage).toMatchObject({
      usedBytes: expect.any(String),
      limitBytes: expect.any(String),
    });
    expect(usage.body.jobsThisMonth).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(usage.body.features)).toBe(true);
    expect(usage.body.plan.code).toBeTruthy();

    const foreign = await a.agent.get(`/api/organizations/${b.organizationId}/usage`);
    expect([403, 404]).toContain(foreign.status);
    expect(foreign.body.members).toBeUndefined();
  });

  it('enforces seat limits with PLAN_LIMIT_REACHED and audits the block', async () => {
    const { agent, organizationId } = await signupOrg('seats');
    const prisma = prismaFrom(app);
    const starter = await prisma.plan.findUniqueOrThrow({ where: { code: 'starter' } });
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        planId: starter.id,
        status: SubscriptionStatus.ACTIVE,
        activatedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000),
      },
    });

    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId },
    });
    for (let i = 0; i < starter.maxUsers - 1; i += 1) {
      const user = await prisma.user.create({
        data: {
          email: `seat-${i}-${organizationId.slice(0, 8)}@entitlement.fieldops.test`,
          fullName: `Seat ${i}`,
          passwordHash: owner.id,
        },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId,
          userId: user.id,
          role: 'TECHNICIAN',
        },
      });
    }

    const over = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `over-${organizationId.slice(0, 8)}@entitlement.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(over.status).toBe(403);
    expect(over.body.error).toBe('PLAN_LIMIT_REACHED');
    expect(over.body.code).toBe('PLAN_LIMIT_REACHED');
    expect(over.body.limitType).toBe('USERS');
    expect(over.body.message).toMatch(
      new RegExp(`${starter.maxUsers}-user limit on your Starter plan`, 'i'),
    );

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_PLAN_LIMIT_BLOCKED },
    });
    expect(audit).toBeTruthy();
  });

  it('enforces storage limits before accepting an upload', async () => {
    const { agent, organizationId } = await signupOrg('storage');
    const prisma = prismaFrom(app);
    const starter = await prisma.plan.findUniqueOrThrow({ where: { code: 'starter' } });
    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId },
    });
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        planId: starter.id,
        status: SubscriptionStatus.ACTIVE,
        activatedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000),
      },
    });

    const client = await prisma.client.create({
      data: { organizationId, name: 'Storage Client' },
    });
    const site = await prisma.site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: 'Storage Site',
        addressLine1: '1 Storage Way',
        city: 'Chicago',
        country: 'US',
      },
    });
    const job = await prisma.job.create({
      data: {
        organizationId,
        clientId: client.id,
        siteId: site.id,
        jobNumber: `ENT-${organizationId.slice(0, 6)}`,
        title: 'Storage job',
        jobType: 'SERVICE',
        status: JobStatus.IN_PROGRESS,
      },
    });

    await prisma.jobFile.create({
      data: {
        organizationId,
        jobId: job.id,
        type: JobFileType.PHOTO,
        objectKey: `organizations/${organizationId}/jobs/${job.id}/photos/fake.jpg`,
        originalName: 'fake.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: starter.maxStorageBytes - 10n,
        uploadedById: owner.userId,
      },
    });

    const tinyJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ...Array.from({ length: 64 }, () => 0),
    ]);

    const upload = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/files`),
    )
      .field('category', 'PHOTO')
      .attach('file', tinyJpeg, { filename: 'over.jpg', contentType: 'image/jpeg' });

    expect(upload.status).toBe(403);
    expect(upload.body.error).toBe('PLAN_LIMIT_REACHED');
    expect(upload.body.limitType).toBe('STORAGE');
    expect(upload.body.message).toMatch(/storage limit on your Starter plan/i);
  });

  it('lets SUPER_ADMIN raise seats via plan change and restores invite capacity', async () => {
    const { agent, organizationId } = await signupOrg('upgrade');
    const prisma = prismaFrom(app);
    const starter = await prisma.plan.findUniqueOrThrow({ where: { code: 'starter' } });
    const professional = await prisma.plan.findUniqueOrThrow({
      where: { code: 'professional' },
    });
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        planId: starter.id,
        status: SubscriptionStatus.ACTIVE,
        activatedAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000),
      },
    });

    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId },
    });
    for (let i = 0; i < starter.maxUsers - 1; i += 1) {
      const user = await prisma.user.create({
        data: {
          email: `up-${i}-${organizationId.slice(0, 8)}@entitlement.fieldops.test`,
          fullName: `Up ${i}`,
          passwordHash: owner.id,
        },
      });
      await prisma.organizationMember.create({
        data: { organizationId, userId: user.id, role: 'TECHNICIAN' },
      });
    }

    const blocked = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `blocked-${organizationId.slice(0, 8)}@entitlement.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(blocked.status).toBe(403);

    const { agent: platform } = await ensurePlatformAdmin();
    const changed = await withCsrf(
      platform.post(
        `/api/platform/organizations/${organizationId}/subscription/change-plan`,
      ),
    ).send({ planCode: 'professional' });
    expect(changed.status).toBe(200);
    expect(changed.body.plan.code).toBe('professional');
    expect(changed.body.plan.maxUsers).toBe(professional.maxUsers);

    const planAudit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_PLAN_CHANGED },
    });
    expect(planAudit).toBeTruthy();

    const allowed = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `allowed-${organizationId.slice(0, 8)}@entitlement.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(allowed.status).toBe(201);
  });

  it('records PLAN_CHANGE_REQUESTED and still blocks mutations when expired', async () => {
    const { agent, organizationId } = await signupOrg('request');
    const prisma = prismaFrom(app);
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: new Date('2026-01-01T00:00:00.000Z'),
        trialEndsAt: new Date('2026-01-15T00:00:00.000Z'),
        graceEndsAt: new Date('2026-01-18T00:00:00.000Z'),
      },
    });

    const request = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/plan-change-requests`),
    ).send({ message: 'Need more seats.' });
    expect(request.status).toBe(201);
    expect(request.body.requestType).toBe('PLAN_CHANGE');

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_PLAN_CHANGE_REQUESTED },
    });
    expect(audit).toBeTruthy();

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `expired-${organizationId.slice(0, 8)}@entitlement.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(invite.status).toBe(403);
    expect(invite.body.error).toBe('SUBSCRIPTION_READ_ONLY');
  });

  it('keeps trial orgs able to mutate within Professional trial entitlement', async () => {
    const { agent, organizationId } = await signupOrg('trial-ok');
    const usage = await agent.get(`/api/organizations/${organizationId}/usage`);
    expect(usage.status).toBe(200);
    expect(usage.body.subscription.effectiveStatus).toBe('TRIALING');
    expect(usage.body.subscription.canMutate).toBe(true);
    // Trial overlays Professional features/limits
    expect(usage.body.plan.code).toBe('professional');

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `trial-${organizationId.slice(0, 8)}@entitlement.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(invite.status).toBe(201);
  });
});
