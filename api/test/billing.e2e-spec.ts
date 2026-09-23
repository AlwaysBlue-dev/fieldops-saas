import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AUDIT_INVOICE_PAID, AUDIT_SUBSCRIPTION_ACTIVATED } from '../src/common/constants.js';
import { PlatformRole, SubscriptionStatus } from '../src/generated/prisma/client.js';
import { api, createTestApp, loginAs, prismaFrom, withCsrf } from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Manual billing and invoices (e2e)', () => {
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
      email: `bill-${suffix}@billing.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Billing Owner ${label}`,
      organizationName: `Billing Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    return {
      agent,
      organizationId: signup.body.organization.id as string,
      slug: signup.body.organization.slug as string,
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

  it('exposes public legal/trust metadata without payment destinations', async () => {
    const trust = await api(app).get('/api/trust');
    expect(trust.status).toBe(200);
    expect(trust.body.supportEmail).toBeTruthy();
    expect(trust.body.terms.version).toBeTruthy();
    expect(JSON.stringify(trust.body)).not.toMatch(/routing number|IBAN|account number/i);
  });

  it('keeps payment instructions off public routes and off tenant users without a matching invoice', async () => {
    const settings = await api(app).get('/api/platform/billing-settings');
    expect(settings.status).toBe(401);

    const { agent, organizationId } = await signupOrg('public');
    const { agent: platform } = await ensurePlatformAdmin();
    await withCsrf(platform.put('/api/platform/billing-settings')).send({
      billingInstructions: 'Pay to secret destination ALPHA-99',
    });
    const created = await withCsrf(platform.post('/api/platform/invoices')).send({
      organizationId,
      planCode: 'professional',
      type: 'ACTIVATION',
    });
    expect(created.status).toBe(201);
    expect(created.body.invoiceNumber).toMatch(/^FC-\d{4}-\d{6}$/);
    expect(created.body.paymentInstructions).toBeNull();

    const draft = await agent.get(
      `/api/organizations/${organizationId}/invoices/${created.body.id}`,
    );
    expect(draft.status).toBe(200);
    expect(draft.body.paymentInstructions).toBeNull();
  });

  it('issues unique invoice numbers and isolates PDF and invoice IDs by tenant', async () => {
    const first = await signupOrg('iso-a');
    const second = await signupOrg('iso-b');
    const { agent: platform } = await ensurePlatformAdmin();
    const one = await withCsrf(platform.post('/api/platform/invoices')).send({
      organizationId: first.organizationId,
      planCode: 'professional',
      type: 'ACTIVATION',
    });
    const two = await withCsrf(platform.post('/api/platform/invoices')).send({
      organizationId: second.organizationId,
      planCode: 'professional',
      type: 'ACTIVATION',
    });
    expect(one.body.invoiceNumber).not.toBe(two.body.invoiceNumber);

    await withCsrf(platform.post(`/api/platform/invoices/${one.body.id}/issue`)).send({});
    const pdf = await first.agent.get(
      `/api/organizations/${first.organizationId}/invoices/${one.body.id}/pdf`,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);

    const foreign = await first.agent.get(
      `/api/organizations/${first.organizationId}/invoices/${two.body.id}`,
    );
    expect(foreign.status).toBe(404);

    const crossPdf = await first.agent.get(
      `/api/organizations/${first.organizationId}/invoices/${two.body.id}/pdf`,
    );
    expect(crossPdf.status).toBe(404);
  });

  it('lets only SUPER_ADMIN mark paid and does not activate on customer payment notice', async () => {
    const { agent, organizationId } = await signupOrg('notice');
    const { agent: platform } = await ensurePlatformAdmin();
    const created = await withCsrf(platform.post('/api/platform/invoices')).send({
      organizationId,
      planCode: 'professional',
      type: 'ACTIVATION',
    });
    await withCsrf(platform.post(`/api/platform/invoices/${created.body.id}/issue`)).send({});

    const blocked = await withCsrf(
      agent.post(`/api/platform/invoices/${created.body.id}/mark-paid`),
    ).send({});
    expect(blocked.status).toBe(403);

    const notice = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/invoices/${created.body.id}/payment-notices`,
      ),
    ).send({ reference: 'WIRE-1', message: 'Sent' });
    expect(notice.status).toBe(201);

    const prisma = prismaFrom(app);
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(subscription.status).toBe(SubscriptionStatus.TRIALING);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(invoice.status).toBe('ISSUED');
  });

  it('activates only after paid invoice confirmation and keeps trial behavior intact', async () => {
    const { agent, organizationId } = await signupOrg('activate');
    const { agent: platform } = await ensurePlatformAdmin();
    const created = await withCsrf(platform.post('/api/platform/invoices')).send({
      organizationId,
      planCode: 'professional',
      type: 'ACTIVATION',
    });
    expect(created.body.totalCents).toBe(49900);
    await withCsrf(platform.post(`/api/platform/invoices/${created.body.id}/issue`)).send({});
    const paid = await withCsrf(
      platform.post(`/api/platform/invoices/${created.body.id}/mark-paid`),
    ).send({});
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('PAID');

    const prisma = prismaFrom(app);
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(before.status).toBe(SubscriptionStatus.TRIALING);

    const activated = await withCsrf(
      platform.post(`/api/platform/invoices/${created.body.id}/activate`),
    ).send({});
    expect(activated.status).toBe(200);
    const after = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(after.status).toBe(SubscriptionStatus.ACTIVE);
    expect(
      await prisma.auditLog.findFirst({
        where: { organizationId, action: AUDIT_INVOICE_PAID },
      }),
    ).toBeTruthy();
    expect(
      await prisma.auditLog.findFirst({
        where: { organizationId, action: AUDIT_SUBSCRIPTION_ACTIVATED },
      }),
    ).toBeTruthy();

    const info = await agent.get(`/api/organizations/${organizationId}/subscription`);
    expect(info.body.effectiveStatus).toBe('ACTIVE');
    expect(info.body.canMutate).toBe(true);
  });

  it('restricts the billing page API to owners and admins', async () => {
    const { agent, organizationId } = await signupOrg('roles');
    const list = await agent.get(`/api/organizations/${organizationId}/invoices`);
    expect(list.status).toBe(200);

    const prisma = prismaFrom(app);
    const tech = await prisma.user.create({
      data: {
        email: `tech-${organizationId.slice(0, 8)}@billing.fieldops.test`,
        fullName: 'Tech',
        passwordHash: (
          await prisma.user.findUniqueOrThrow({
            where: { email: 'jordan.hale@northstar.fieldops.local' },
          })
        ).passwordHash,
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: tech.id,
        role: 'TECHNICIAN',
      },
    });
    const { agent: techAgent } = await loginAs(
      app,
      tech.email,
      SEED_PASSWORD,
    );
    const denied = await techAgent.get(`/api/organizations/${organizationId}/invoices`);
    expect(denied.status).toBe(403);
  });
});
