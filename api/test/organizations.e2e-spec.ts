import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { generateUrlToken, hashToken } from '../src/common/crypto-token.js';
import {
  InvitationStatus,
  MembershipStatus,
  OrganizationRole,
} from '../src/generated/prisma/client.js';
import {
  api,
  createTestApp,
  loginAs,
  prismaFrom,
  withCsrf,
} from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Organizations, members, invitations (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets an owner complete onboarding profile and operations settings', async () => {
    const suffix = Date.now();
    const agent = api(app);
    const signup = await withCsrf(agent.post('/api/auth/signup')).send({
      email: `owner-${suffix}@onboard.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: 'Onboard Owner',
      organizationName: `Onboard Co ${suffix}`,
      timezone: 'America/Chicago',
    });
    expect(signup.status).toBe(201);
    const organizationId = signup.body.organization.id;

    const profile = await withCsrf(
      agent.patch(`/api/organizations/${organizationId}`),
    ).send({
      name: `Onboard Co ${suffix}`,
      industry: 'Electrical',
      phone: '+1-555-0100',
      timezone: 'America/Chicago',
    });
    expect(profile.status).toBe(200);
    expect(profile.body.industry).toBe('Electrical');

    const advanced = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/onboarding`),
    ).send({
      step: 3,
      settings: {
        jobNumberPrefix: 'OB-',
        workingWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        defaultDailyHoursLimit: 8,
        requireClientSignature: true,
        requireGps: false,
      },
    });
    expect(advanced.status).toBe(201);
    expect(advanced.body.settings.requireGps).toBe(false);
    expect(advanced.body.onboardingStep).toBe(3);

    const done = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/onboarding`),
    ).send({ complete: true });
    expect(done.status).toBe(201);
    expect(done.body.onboardingCompletedAt).toBeTruthy();
  });

  it('blocks a Northstar owner from inviting into BluePeak', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const response = await withCsrf(
      agent.post(`/api/organizations/${bluepeakId}/invitations`),
    ).send({
      email: 'intruder@fieldops.test',
      role: OrganizationRole.TECHNICIAN,
    });
    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('email');
  });

  it('invites a new user, stores only the token hash, and accepts once', async () => {
    const suffix = Date.now();
    const inviteEmail = `invitee-${suffix}@join.fieldops.test`;
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );

    const created = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/invitations`),
    ).send({
      email: inviteEmail,
      role: OrganizationRole.TECHNICIAN,
    });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe(inviteEmail);
    expect(created.body.tokenHash).toBeUndefined();
    expect(created.body.token).toBeUndefined();

    const prisma = prismaFrom(app);
    const stored = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(stored.tokenHash).toHaveLength(64);

    const rawToken = generateUrlToken();
    await prisma.organizationInvitation.update({
      where: { id: stored.id },
      data: { tokenHash: hashToken(rawToken) },
    });

    const guest = api(app);
    const preview = await guest.get(`/api/invitations/${rawToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.organizationName).toBe('Northstar Electrical');
    expect(preview.body.role).toBe(OrganizationRole.TECHNICIAN);

    const accepted = await withCsrf(
      guest.post(`/api/invitations/${rawToken}/accept`),
    ).send({
      fullName: 'New Tech',
      password: SEED_PASSWORD,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.email).toBe(inviteEmail);
    expect(accepted.body.organization.slug).toBe('northstar-electrical');
    expect(accepted.body.accessToken).toBeUndefined();
    expect(JSON.stringify(accepted.body)).not.toMatch(/eyJ/);

    const replay = await withCsrf(
      api(app).post(`/api/invitations/${rawToken}/accept`),
    ).send({
      fullName: 'New Tech',
      password: SEED_PASSWORD,
    });
    expect(replay.status).toBe(409);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'organization.invitation_accepted',
        organizationId: northstarId,
        actorUserId: accepted.body.user.id,
      },
    });
    expect(audit).toBeTruthy();
  });

  it('lets an existing user accept after signing in', async () => {
    const suffix = Date.now();
    const inviteEmail = `existing-${suffix}@join.fieldops.test`;
    const guest = api(app);
    await withCsrf(guest.post('/api/auth/signup')).send({
      email: inviteEmail,
      password: SEED_PASSWORD,
      fullName: 'Existing User',
      organizationName: `Existing Co ${suffix}`,
    });

    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const created = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/invitations`),
    ).send({
      email: inviteEmail,
      role: OrganizationRole.SUPERVISOR,
    });
    expect(created.status).toBe(201);

    const prisma = prismaFrom(app);
    const rawToken = generateUrlToken();
    await prisma.organizationInvitation.update({
      where: { id: created.body.id },
      data: { tokenHash: hashToken(rawToken) },
    });

    const anonymous = await withCsrf(
      api(app).post(`/api/invitations/${rawToken}/accept`),
    ).send({});
    expect(anonymous.status).toBe(401);

    const signedIn = api(app);
    await withCsrf(signedIn.post('/api/auth/login')).send({
      email: inviteEmail,
      password: SEED_PASSWORD,
    });
    const accepted = await withCsrf(
      signedIn.post(`/api/invitations/${rawToken}/accept`),
    ).send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.membership.role).toBe(OrganizationRole.SUPERVISOR);

    const orgs = await signedIn.get('/api/me/organizations');
    const slugs = orgs.body.map(
      (item: { organization: { slug: string } }) => item.organization.slug,
    );
    expect(slugs).toEqual(
      expect.arrayContaining(['northstar-electrical']),
    );
  });

  it('revokes a pending invitation and refuses the old token', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const created = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/invitations`),
    ).send({
      email: `revoke-${Date.now()}@fieldops.test`,
      role: OrganizationRole.TECHNICIAN,
    });
    const rawToken = generateUrlToken();
    const prisma = prismaFrom(app);
    await prisma.organizationInvitation.update({
      where: { id: created.body.id },
      data: { tokenHash: hashToken(rawToken) },
    });

    const revoked = await withCsrf(
      agent.post(
        `/api/organizations/${northstarId}/invitations/${created.body.id}/revoke`,
      ),
    );
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe(InvitationStatus.REVOKED);

    const accept = await withCsrf(
      api(app).post(`/api/invitations/${rawToken}/accept`),
    ).send({
      fullName: 'Too Late',
      password: SEED_PASSWORD,
    });
    expect([404, 410]).toContain(accept.status);
  });

  it('refuses to deactivate or demote the last owner', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const prisma = prismaFrom(app);
    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: {
        organizationId: northstarId,
        role: OrganizationRole.OWNER,
        status: MembershipStatus.ACTIVE,
        user: { email: 'jordan.hale@northstar.fieldops.local' },
      },
    });

    const demote = await withCsrf(
      agent.patch(`/api/organizations/${northstarId}/members/${owner.id}`),
    ).send({ role: OrganizationRole.ADMIN });
    expect(demote.status).toBe(403);

    const deactivate = await withCsrf(
      agent.patch(`/api/organizations/${northstarId}/members/${owner.id}`),
    ).send({ status: MembershipStatus.INACTIVE });
    expect(deactivate.status).toBe(403);
  });

  it('forbids a technician from inviting members', async () => {
    const { agent } = await loginAs(
      app,
      'casey.nguyen@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const response = await withCsrf(
      agent.post(`/api/organizations/${northstarId}/invitations`),
    ).send({
      email: 'nope@fieldops.test',
      role: OrganizationRole.TECHNICIAN,
    });
    expect(response.status).toBe(403);
  });
});
