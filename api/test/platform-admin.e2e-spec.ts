import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_ACTIVATION_REQUEST_UPDATED,
  AUDIT_ORGANIZATION_ACTIVATED,
  AUDIT_ORGANIZATION_SUSPENDED,
  AUDIT_TRIAL_EXTENDED,
} from '../src/common/constants.js';
import {
  ActivationRequestStatus,
  MembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  PlatformRole,
  SubscriptionStatus,
} from '../src/generated/prisma/client.js';
import { api, createTestApp, loginAs, prismaFrom, withCsrf } from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Platform super admin (e2e)', () => {
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
      email: `owner-${suffix}@platform.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Platform Owner ${label}`,
      organizationName: `Platform Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    return {
      agent,
      organizationId: signup.body.organization.id as string,
      email: `owner-${suffix}@platform.fieldops.test`,
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

  it('denies normal users and organization owners from platform endpoints', async () => {
    const owner = await signupOrg('denied');
    const dashboard = await owner.agent.get('/api/platform/dashboard');
    expect(dashboard.status).toBe(403);

    const orgs = await owner.agent.get('/api/platform/organizations');
    expect(orgs.status).toBe(403);

    const activate = await withCsrf(
      owner.agent.post(
        `/api/platform/organizations/${owner.organizationId}/subscription/activate`,
      ),
    ).send({ planCode: 'professional' });
    expect(activate.status).toBe(403);

    const techLogin = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    expect(techLogin.response.status).toBe(200);
    const techDash = await techLogin.agent.get('/api/platform/dashboard');
    expect(techDash.status).toBe(403);
  });

  it(
    'lets SUPER_ADMIN read the dashboard and filtered organization list',
    async () => {
    const created = await signupOrg('dash');
    const { agent: platform } = await ensurePlatformAdmin();

    const dashboard = await platform.get('/api/platform/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.totalOrganizations).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.totalUsers).toBeGreaterThanOrEqual(1);
    expect(dashboard.body).toHaveProperty('trialOrganizations');
    expect(dashboard.body).toHaveProperty('graceOrganizations');
    expect(dashboard.body).toHaveProperty('activeOrganizations');
    expect(dashboard.body).toHaveProperty('expiredTrials');
    expect(dashboard.body).toHaveProperty('suspendedOrganizations');
    expect(dashboard.body).toHaveProperty('activationRequests');
    expect(Array.isArray(dashboard.body.recentSignups)).toBe(true);

    const listed = await platform.get(
      `/api/platform/organizations?search=${encodeURIComponent(created.organizationId.slice(0, 8))}`,
    );
    expect(listed.status).toBe(200);

    const detail = await platform.get(
      `/api/platform/organizations/${created.organizationId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(created.organizationId);
    expect(detail.body.timezone).toBe('America/Chicago');
    expect(detail.body.owner?.email).toBe(created.email);
    expect(detail.body.usage).toMatchObject({
      members: expect.any(Number),
      jobs: expect.any(Number),
    });
    expect(detail.body.usage.storageBytes).toBeDefined();
    expect(detail.body.jobs).toBeUndefined();
  },
    90_000,
  );

  it('extends trial, suspends with reason, reactivates, and writes audits', async () => {
    const { agent, organizationId } = await signupOrg('ops');
    const prisma = prismaFrom(app);
    const { agent: platform } = await ensurePlatformAdmin();

    const before = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });

    const extended = await withCsrf(
      platform.post(
        `/api/platform/organizations/${organizationId}/subscription/extend-trial`,
      ),
    ).send({ days: 7 });
    expect(extended.status).toBe(200);
    expect(extended.body.effectiveStatus).toBe('TRIALING');
    const afterExtend = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(afterExtend.trialEndsAt!.getTime()).toBeGreaterThan(
      before.trialEndsAt!.getTime(),
    );
    const trialAudit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_TRIAL_EXTENDED },
    });
    expect(trialAudit).toBeTruthy();

    const customEnd = new Date(Date.now() + 45 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const custom = await withCsrf(
      platform.post(
        `/api/platform/organizations/${organizationId}/subscription/extend-trial`,
      ),
    ).send({ trialEndsAt: customEnd });
    expect(custom.status).toBe(200);

    const suspendMissing = await withCsrf(
      platform.post(
        `/api/platform/organizations/${organizationId}/subscription/suspend`,
      ),
    ).send({});
    expect(suspendMissing.status).toBe(400);

    const suspended = await withCsrf(
      platform.post(
        `/api/platform/organizations/${organizationId}/subscription/suspend`,
      ),
    ).send({ reason: 'Non-payment follow-up' });
    expect(suspended.status).toBe(200);
    expect(suspended.body.effectiveStatus).toBe('SUSPENDED');

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    expect(org.status).toBe(OrganizationStatus.SUSPENDED);

    const suspendAudit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_ORGANIZATION_SUSPENDED },
    });
    expect(suspendAudit).toBeTruthy();
    expect(JSON.stringify(suspendAudit?.newValues)).toContain('Non-payment');

    const blocked = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `blocked-${organizationId.slice(0, 8)}@platform.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect([403, 404]).toContain(blocked.status);

    const reactivated = await withCsrf(
      platform.post(
        `/api/platform/organizations/${organizationId}/subscription/reactivate`,
      ),
    ).send({});
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.effectiveStatus).toBe('TRIALING');
  });

  it('activates an organization, restores mutations, closes activation requests, and audits', async () => {
    const { agent, organizationId } = await signupOrg('activate');
    const prisma = prismaFrom(app);

    await prisma.subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: new Date('2026-07-01T12:00:00.000Z'),
        trialEndsAt: new Date('2026-07-15T12:00:00.000Z'),
        graceEndsAt: new Date('2026-07-18T12:00:00.000Z'),
      },
    });

    const request = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/activation-requests`),
    ).send({ message: 'Ready to go live.' });
    expect(request.status).toBe(201);

    const { agent: platform } = await ensurePlatformAdmin();
    const listed = await platform.get('/api/platform/activation-requests');
    expect(listed.status).toBe(200);
    expect(
      listed.body.some(
        (row: { organizationId: string }) =>
          row.organizationId === organizationId,
      ),
    ).toBe(true);

    const contacted = await withCsrf(
      platform.patch(
        `/api/platform/activation-requests/${request.body.id}`,
      ),
    ).send({ status: 'CONTACTED' });
    expect(contacted.status).toBe(200);
    expect(contacted.body.status).toBe('CONTACTED');

    const requestAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId,
        action: AUDIT_ACTIVATION_REQUEST_UPDATED,
        entityId: request.body.id,
      },
    });
    expect(requestAudit).toBeTruthy();

    const activated = await withCsrf(
      platform.post(
        `/api/platform/organizations/${organizationId}/subscription/activate`,
      ),
    ).send({
      planCode: 'starter',
      currentPeriodStart: '2026-09-23',
      currentPeriodEnd: '2027-09-23',
    });
    expect(activated.status).toBe(200);
    expect(activated.body.effectiveStatus).toBe('ACTIVE');
    expect(activated.body.plan.code).toBe('starter');
    expect(activated.body.readOnly).toBe(false);

    const closed = await prisma.activationRequest.findUniqueOrThrow({
      where: { id: request.body.id },
    });
    expect(closed.status).toBe(ActivationRequestStatus.CLOSED);

    const activateAudit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_ORGANIZATION_ACTIVATED },
    });
    expect(activateAudit).toBeTruthy();

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `restored-${organizationId.slice(0, 8)}@platform.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(invite.status).toBe(201);
  });

  it('scopes platform mutations to the path organizationId only', async () => {
    const a = await signupOrg('iso-a');
    const b = await signupOrg('iso-b');
    const { agent: platform } = await ensurePlatformAdmin();

    const activated = await withCsrf(
      platform.post(
        `/api/platform/organizations/${a.organizationId}/subscription/activate`,
      ),
    ).send({
      planCode: 'professional',
      currentPeriodStart: '2026-01-01',
      currentPeriodEnd: '2027-01-01',
    });
    expect(activated.status).toBe(200);

    const rejected = await withCsrf(
      platform.post(
        `/api/platform/organizations/${a.organizationId}/subscription/activate`,
      ),
    ).send({
      planCode: 'professional',
      organizationId: b.organizationId,
    });
    expect(rejected.status).toBe(400);

    const prisma = prismaFrom(app);
    const subA = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: a.organizationId },
    });
    const subB = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: b.organizationId },
    });
    expect(subA.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subB.status).toBe(SubscriptionStatus.TRIALING);
    expect(subB.activatedAt).toBeNull();
  });

  it('keeps seed OWNER platformRole as USER even with ACTIVE membership', async () => {
    const prisma = prismaFrom(app);
    const ownerMembership = await prisma.organizationMember.findFirst({
      where: {
        role: OrganizationRole.OWNER,
        status: MembershipStatus.ACTIVE,
        user: { email: 'jordan.hale@northstar.fieldops.local' },
      },
      include: { user: true },
    });
    expect(ownerMembership).toBeTruthy();
    expect(ownerMembership!.user.platformRole).toBe(PlatformRole.USER);

    const { agent, response } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    expect(response.status).toBe(200);
    const denied = await agent.get('/api/platform/organizations');
    expect(denied.status).toBe(403);
  });
});
