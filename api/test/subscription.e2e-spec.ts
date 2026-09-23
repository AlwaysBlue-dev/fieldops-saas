import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_SUBSCRIPTION_ACTIVATED,
  AUDIT_TRIAL_STARTED,
} from '../src/common/constants.js';
import { PlatformRole, SubscriptionStatus } from '../src/generated/prisma/client.js';
import { api, createTestApp, loginAs, prismaFrom, withCsrf } from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Subscription trial and manual activation (e2e)', () => {
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
      email: `owner-${suffix}@trial.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Trial Owner ${label}`,
      organizationName: `Trial Co ${suffix}`,
      timezone: 'America/Chicago',
    });
    expect(signup.status).toBe(201);
    return {
      agent,
      organizationId: signup.body.organization.id as string,
      email: `owner-${suffix}@trial.fieldops.test`,
    };
  }

  async function setSubscription(
    organizationId: string,
    data: {
      status?: SubscriptionStatus;
      trialStartedAt?: Date;
      trialEndsAt?: Date;
      graceEndsAt?: Date;
      activatedAt?: Date | null;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
    },
  ) {
    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data,
    });
  }

  it('gives a fresh organization a 14-day Professional trial that can mutate', async () => {
    const { agent, organizationId } = await signupOrg('fresh');
    const prisma = prismaFrom(app);
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
      include: { plan: true },
    });
    expect(subscription.status).toBe(SubscriptionStatus.TRIALING);
    expect(subscription.plan.code).toBe('professional');
    expect(subscription.trialStartedAt).toBeTruthy();
    expect(subscription.trialEndsAt).toBeTruthy();
    expect(subscription.graceEndsAt).toBeTruthy();

    const started = subscription.trialStartedAt!.getTime();
    const trialMs = subscription.trialEndsAt!.getTime() - started;
    const graceMs = subscription.graceEndsAt!.getTime() - started;
    expect(Math.round(trialMs / 86_400_000)).toBe(14);
    expect(Math.round(graceMs / 86_400_000)).toBe(17);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_TRIAL_STARTED },
    });
    expect(audit).toBeTruthy();

    const info = await agent.get(`/api/organizations/${organizationId}/subscription`);
    expect(info.status).toBe(200);
    expect(info.body.effectiveStatus).toBe('TRIALING');
    expect(info.body.plan.code).toBe('professional');
    expect(info.body.readOnly).toBe(false);
    expect(info.body.trialDaysRemaining).toBeGreaterThan(0);
    expect(info.body.trialDaysRemaining).toBeLessThanOrEqual(14);

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `tech-${organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(invite.status).toBe(201);
  });

  it('lets a grace organization mutate and reports remaining grace days', async () => {
    const { agent, organizationId } = await signupOrg('grace');
    const now = Date.now();
    await setSubscription(organizationId, {
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date(now - 15 * 86_400_000),
      trialEndsAt: new Date(now - 12 * 60 * 60 * 1000),
      graceEndsAt: new Date(now + 2 * 86_400_000),
    });

    const info = await agent.get(`/api/organizations/${organizationId}/subscription`);
    expect(info.status).toBe(200);
    expect(info.body.effectiveStatus).toBe('GRACE');
    expect(info.body.canMutate).toBe(true);
    expect(info.body.trialDaysRemaining).toBe(0);
    expect(info.body.graceDaysRemaining).toBeGreaterThan(0);

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `grace-${organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(invite.status).toBe(201);
  });

  it('lets an expired organization read but not mutate', async () => {
    const { agent, organizationId } = await signupOrg('expired');
    await setSubscription(organizationId, {
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date('2026-08-01T12:00:00.000Z'),
      trialEndsAt: new Date('2026-08-15T12:00:00.000Z'),
      graceEndsAt: new Date('2026-08-18T12:00:00.000Z'),
    });

    const info = await agent.get(`/api/organizations/${organizationId}/subscription`);
    expect(info.status).toBe(200);
    expect(info.body.effectiveStatus).toBe('TRIAL_EXPIRED');
    expect(info.body.readOnly).toBe(true);

    const org = await agent.get(`/api/organizations/${organizationId}`);
    expect(org.status).toBe(200);
    expect(org.body.id).toBe(organizationId);

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `blocked-${organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(invite.status).toBe(403);
    expect(invite.body.error).toBe('SUBSCRIPTION_READ_ONLY');
    expect(invite.body.message).toMatch(/trial has ended/i);

    const request = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/activation-requests`),
    ).send({ message: 'Please activate this workspace.' });
    expect(request.status).toBe(201);
    expect(request.body.status).toBe('OPEN');
  });

  it('does not trust a client-supplied subscription state to bypass the backend', async () => {
    const { agent, organizationId } = await signupOrg('bypass');
    await setSubscription(organizationId, {
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date('2026-07-01T12:00:00.000Z'),
      trialEndsAt: new Date('2026-07-15T12:00:00.000Z'),
      graceEndsAt: new Date('2026-07-18T12:00:00.000Z'),
    });

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    )
      .set('X-Subscription-Status', 'ACTIVE')
      .send({
        email: `bypass-${organizationId.slice(0, 8)}@trial.fieldops.test`,
        role: 'TECHNICIAN',
      });
    expect(invite.status).toBe(403);
    expect(invite.body.error).toBe('SUBSCRIPTION_READ_ONLY');
  });

  it('lets an ACTIVE organization mutate and blocks a SUSPENDED one', async () => {
    const { agent, organizationId } = await signupOrg('active-suspend');
    await setSubscription(organizationId, {
      status: SubscriptionStatus.ACTIVE,
      activatedAt: new Date('2026-09-01T12:00:00.000Z'),
      currentPeriodStart: new Date('2026-09-01T12:00:00.000Z'),
      currentPeriodEnd: new Date('2027-09-01T12:00:00.000Z'),
    });

    const activeInvite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `active-${organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(activeInvite.status).toBe(201);

    await setSubscription(organizationId, { status: SubscriptionStatus.SUSPENDED });
    const suspended = await agent.get(
      `/api/organizations/${organizationId}/subscription`,
    );
    expect(suspended.body.effectiveStatus).toBe('SUSPENDED');
    expect(suspended.body.readOnly).toBe(true);

    const blocked = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `suspended-${organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(blocked.status).toBe(403);
  });

  it('keeps one organization subscription from affecting another', async () => {
    const expired = await signupOrg('iso-a');
    const active = await signupOrg('iso-b');
    await setSubscription(expired.organizationId, {
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date(Date.now() - 20 * 86_400_000),
      trialEndsAt: new Date(Date.now() - 6 * 86_400_000),
      graceEndsAt: new Date(Date.now() - 3 * 86_400_000),
    });

    const expiredInfo = await expired.agent.get(
      `/api/organizations/${expired.organizationId}/subscription`,
    );
    const activeInfo = await active.agent.get(
      `/api/organizations/${active.organizationId}/subscription`,
    );
    expect(expiredInfo.body.effectiveStatus).toBe('TRIAL_EXPIRED');
    expect(activeInfo.body.effectiveStatus).toBe('TRIALING');
    expect(activeInfo.body.canMutate).toBe(true);

    const blocked = await withCsrf(
      expired.agent.post(`/api/organizations/${expired.organizationId}/invitations`),
    ).send({
      email: `blocked-${expired.organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    const allowed = await withCsrf(
      active.agent.post(`/api/organizations/${active.organizationId}/invitations`),
    ).send({
      email: `allowed-${active.organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(blocked.status).toBe(403);
    expect(allowed.status).toBe(201);
  });

  it('lets a SUPER_ADMIN manually activate an expired organization and restore mutations', async () => {
    const { agent, organizationId } = await signupOrg('activate');
    await setSubscription(organizationId, {
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date('2026-07-01T12:00:00.000Z'),
      trialEndsAt: new Date('2026-07-15T12:00:00.000Z'),
      graceEndsAt: new Date('2026-07-18T12:00:00.000Z'),
    });

    const prisma = prismaFrom(app);
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: 'professional' },
    });
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

    const { agent: platform } = await loginAs(
      app,
      'platform.admin@fieldops.test',
      SEED_PASSWORD,
    );
    const activated = await withCsrf(
      platform.post(`/api/platform/organizations/${organizationId}/subscription/activate`),
    ).send({
      planId: plan.id,
      currentPeriodStart: '2026-09-23',
      currentPeriodEnd: '2027-09-23',
    });
    expect(activated.status).toBe(200);
    expect(activated.body.effectiveStatus).toBe('ACTIVE');
    expect(activated.body.readOnly).toBe(false);
    expect(activated.body.plan.code).toBe('professional');

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId, action: AUDIT_SUBSCRIPTION_ACTIVATED },
    });
    expect(audit).toBeTruthy();

    const invite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email: `restored-${organizationId.slice(0, 8)}@trial.fieldops.test`,
      role: 'TECHNICIAN',
    });
    expect(invite.status).toBe(201);
  });
});
