import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_CLIENT_CREATED,
  AUDIT_CLIENT_DEACTIVATED,
  AUDIT_SITE_CREATED,
} from '../src/common/constants.js';
import { EntityStatus, SubscriptionStatus } from '../src/generated/prisma/client.js';
import {
  api,
  createTestApp,
  loginAs,
  prismaFrom,
  withCsrf,
} from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Clients and sites (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let bluepeakClientId = '';
  let northstarClientId = '';

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
    bluepeakClientId = (
      await prisma.client.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;
    northstarClientId = (
      await prisma.client.findFirstOrThrow({
        where: { organizationId: northstarId },
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
      email: `owner-${suffix}@clients.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Client Owner ${label}`,
      organizationName: `Client Co ${suffix}`,
      timezone: 'America/Chicago',
    });
    expect(signup.status).toBe(201);
    return { agent, organizationId: signup.body.organization.id as string };
  }

  it('lists, searches, and paginates organization clients', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const all = await agent.get(`/api/organizations/${northstarId}/clients`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThanOrEqual(2);
    expect(all.body.items[0]).toHaveProperty('clientCode');
    expect(all.body.items[0]).toHaveProperty('siteCount');

    const search = await agent.get(
      `/api/organizations/${northstarId}/clients?search=Harborview`,
    );
    expect(search.status).toBe(200);
    expect(search.body.items.some((item: { name: string }) => item.name.includes('Harborview'))).toBe(
      true,
    );

    const page = await agent.get(
      `/api/organizations/${northstarId}/clients?page=1&pageSize=1&sort=name&order=asc`,
    );
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.pageSize).toBe(1);
    expect(page.body.total).toBeGreaterThanOrEqual(2);
  });

  it('creates a client and site, then deactivates without deleting history', async () => {
    const { agent, organizationId } = await signupOrg('create');
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/clients`),
    ).send({
      name: 'River Plant',
      clientCode: 'RP-1',
      primaryContactName: 'Ada Cole',
      primaryContactEmail: 'ada@river.example',
      primaryContactPhone: '+1-555-0101',
      billingEmail: 'ap@river.example',
    });
    expect(created.status).toBe(201);
    expect(created.body.clientCode).toBe('RP-1');
    expect(created.body.primaryContactEmail).toBe('ada@river.example');

    const site = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/clients/${created.body.id}/sites`),
    ).send({
      name: 'Main plant',
      addressLine1: '100 River Rd',
      city: 'Aurora',
      stateRegion: 'IL',
      postalCode: '60502',
      country: 'US',
      latitude: 41.76,
      longitude: -88.32,
      siteContactName: 'Night Supervisor',
      siteContactPhone: '+1-555-0199',
    });
    expect(site.status).toBe(201);
    expect(site.body.city).toBe('Aurora');
    expect(site.body.latitude).toBeCloseTo(41.76);
    expect(site.body.contacts[0].name).toBe('Night Supervisor');

    const prisma = prismaFrom(app);
    expect(
      await prisma.auditLog.findFirst({
        where: { organizationId, action: AUDIT_CLIENT_CREATED },
      }),
    ).toBeTruthy();
    expect(
      await prisma.auditLog.findFirst({
        where: { organizationId, action: AUDIT_SITE_CREATED },
      }),
    ).toBeTruthy();

    const deactivated = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/clients/${created.body.id}/deactivate`),
    ).send({});
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.status).toBe(EntityStatus.INACTIVE);

    const stillThere = await prisma.client.findFirst({
      where: { id: created.body.id, organizationId },
    });
    expect(stillThere).toBeTruthy();
    expect(
      await prisma.auditLog.findFirst({
        where: { organizationId, action: AUDIT_CLIENT_DEACTIVATED },
      }),
    ).toBeTruthy();

    const addSite = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/clients/${created.body.id}/sites`),
    ).send({
      name: 'Should fail',
      addressLine1: '1 Main',
      city: 'Aurora',
      country: 'US',
    });
    expect(addSite.status).toBe(400);
  });

  it('blocks technicians from managing clients and lets them read', async () => {
    const { agent } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const list = await agent.get(`/api/organizations/${northstarId}/clients`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);

    const detail = await agent.get(
      `/api/organizations/${northstarId}/clients/${northstarClientId}`,
    );
    expect(detail.status).toBe(200);

    const create = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/clients`),
    ).send({ name: 'Forbidden Client' });
    expect(create.status).toBe(403);

    const deactivate = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/clients/${northstarClientId}/deactivate`),
    ).send({});
    expect(deactivate.status).toBe(403);
  });

  it('never returns another organization client or site by UUID', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const client = await agent.get(
      `/api/organizations/${northstarId}/clients/${bluepeakClientId}`,
    );
    expect(client.status).toBe(404);
    expect(client.body).not.toHaveProperty('name');

    const viaForeignOrg = await agent.get(
      `/api/organizations/${bluepeakId}/clients/${bluepeakClientId}`,
    );
    expect(viaForeignOrg.status).toBe(404);

    const prisma = prismaFrom(app);
    const bluepeakSite = await prisma.site.findFirstOrThrow({
      where: { organizationId: bluepeakId },
    });
    const site = await agent.get(
      `/api/organizations/${northstarId}/sites/${bluepeakSite.id}`,
    );
    expect(site.status).toBe(404);
    expect(site.body).not.toHaveProperty('addressLine1');
  });

  it('rejects expired-subscription client mutations while reads still work', async () => {
    const { agent, organizationId } = await signupOrg('expired');
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/clients`),
    ).send({
      name: 'Before expiry',
      primaryContactEmail: 'ops@before.example',
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

    const list = await agent.get(`/api/organizations/${organizationId}/clients`);
    expect(list.status).toBe(200);
    expect(list.body.items[0].name).toBe('Before expiry');

    const mutate = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/clients`),
    ).send({ name: 'After expiry' });
    expect(mutate.status).toBe(403);
    expect(mutate.body.error).toBe('SUBSCRIPTION_READ_ONLY');
  });
});
