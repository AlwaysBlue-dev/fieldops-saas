import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { hashPassword } from '../src/auth/password.js';
import { UserStatus } from '../src/generated/prisma/client.js';
import {
  api,
  createTestApp,
  loginAs,
  prismaFrom,
  withCsrf,
} from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs up a user, organization, owner membership, settings, and trial subscription', async () => {
    const suffix = Date.now();
    const email = `owner-${suffix}@signup.fieldops.test`;
    const agent = api(app);

    const response = await withCsrf(agent.post('/api/auth/signup')).send({
      email,
      password: SEED_PASSWORD,
      fullName: 'Signup Owner',
      organizationName: `Signup Org ${suffix}`,
      timezone: 'America/Chicago',
    });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.organization.slug).toBeTruthy();
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fieldops_access='),
        expect.stringContaining('HttpOnly'),
        expect.stringContaining('fieldops_refresh='),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/eyJ/);

    const prisma = prismaFrom(app);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const membership = await prisma.organizationMember.findFirstOrThrow({
      where: { userId: user.id },
    });
    const settings = await prisma.organizationSettings.findUniqueOrThrow({
      where: { organizationId: membership.organizationId },
    });
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: membership.organizationId },
    });
    expect(membership.role).toBe('OWNER');
    expect(settings.timezone).toBe('America/Chicago');
    expect(subscription.status).toBe('TRIALING');
  });

  it('logs in with valid credentials and returns the current user', async () => {
    const { agent, response } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(
      'jordan.hale@northstar.fieldops.local',
    );

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('jordan.hale@northstar.fieldops.local');
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('rejects an invalid password', async () => {
    const { response } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      'wrong-password-value',
    );
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid credentials');
  });

  it('rejects an inactive user', async () => {
    const prisma = prismaFrom(app);
    const email = `inactive-${Date.now()}@fieldops.test`;
    await prisma.user.create({
      data: {
        email,
        fullName: 'Inactive User',
        passwordHash: await hashPassword(SEED_PASSWORD),
        status: UserStatus.INACTIVE,
      },
    });

    const { response } = await loginAs(app, email, SEED_PASSWORD);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Account is inactive');
  });

  it('rejects unauthenticated requests to /api/auth/me', async () => {
    const response = await api(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rotates refresh cookies and rejects reuse after logout', async () => {
    const { agent, response } = await loginAs(
      app,
      'dana.brooks@bluepeak.fieldops.local',
      SEED_PASSWORD,
    );
    expect(response.status).toBe(200);

    const refreshed = await withCsrf(agent.post('/api/auth/refresh'));
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.email).toBe(
      'dana.brooks@bluepeak.fieldops.local',
    );

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);

    const logout = await withCsrf(agent.post('/api/auth/logout'));
    expect(logout.status).toBe(204);

    const meAfter = await agent.get('/api/auth/me');
    expect(meAfter.status).toBe(401);

    const refreshAfter = await withCsrf(agent.post('/api/auth/refresh'));
    expect(refreshAfter.status).toBe(401);
  });

  it('lists organizations for the authenticated user', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const response = await agent.get('/api/me/organizations');
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0].organization.slug).toBe('northstar-electrical');
    expect(response.body[0].role).toBe('OWNER');
  });
});
