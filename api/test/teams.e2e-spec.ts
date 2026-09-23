import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_CERTIFICATION_ADDED,
  AUDIT_SKILL_ASSIGNED,
  AUDIT_TEAM_CREATED,
  AUDIT_TEAM_MEMBER_ADDED,
  AUDIT_TEAM_MEMBER_REMOVED,
  AUDIT_TEAM_SUPERVISOR_CHANGED,
} from '../src/common/constants.js';
import { generateUrlToken, hashToken } from '../src/common/crypto-token.js';
import {
  EntityStatus,
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

describe('Teams and technicians (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let northstarTeamId = '';
  let bluepeakTeamId = '';
  let rileyId = '';
  let samId = '';

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
    northstarTeamId = (
      await prisma.team.findFirstOrThrow({
        where: { organizationId: northstarId, name: 'Chicago Service' },
      })
    ).id;
    bluepeakTeamId = (
      await prisma.team.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;
    rileyId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'riley.chen@northstar.fieldops.local' },
      })
    ).id;
    samId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'sam.ortega@northstar.fieldops.local' },
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
      email: `owner-${suffix}@teams.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Team Owner ${label}`,
      organizationName: `Crew Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    return { agent, organizationId: signup.body.organization.id as string };
  }

  it('lists teams with supervisor, members, and skill summary from live data', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const list = await agent.get(`/api/organizations/${northstarId}/teams`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    const chicago = list.body.items.find(
      (item: { name: string }) => item.name === 'Chicago Service',
    );
    expect(chicago.supervisor.fullName).toBe('Riley Chen');
    expect(chicago.memberCount).toBeGreaterThanOrEqual(3);
    expect(chicago.skillSummary).toEqual(expect.arrayContaining(['Electrical']));
    expect(chicago).not.toHaveProperty('passwordHash');
  });

  it('creates, updates, assigns members, and changes supervisor with audit', async () => {
    const { agent, organizationId } = await signupOrg('mutate');
    const prisma = prismaFrom(app);
    const extra = await prisma.user.create({
      data: {
        email: `tech-${Date.now()}@teams.fieldops.test`,
        fullName: 'Pat Rivera',
        passwordHash: 'unused-for-login',
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: extra.id,
        role: OrganizationRole.TECHNICIAN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams`),
    ).send({
      name: 'Night Response',
      code: 'NR-1',
      description: 'After-hours crew',
    });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('NR-1');
    expect(created.body.status).toBe(EntityStatus.ACTIVE);

    const added = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams/${created.body.id}/members`),
    ).send({ userId: extra.id });
    expect(added.status).toBe(201);
    expect(added.body.members.some((member: { userId: string }) => member.userId === extra.id)).toBe(
      true,
    );

    const supervisor = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams/${created.body.id}/supervisor`),
    ).send({ supervisorUserId: extra.id });
    expect(supervisor.status).toBe(200);
    expect(supervisor.body.supervisor.userId).toBe(extra.id);

    const removed = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/teams/${created.body.id}/members/${extra.id}/remove`,
      ),
    ).send({});
    expect(removed.status).toBe(200);
    expect(
      removed.body.members.some((member: { userId: string }) => member.userId === extra.id),
    ).toBe(false);

    const actions = (
      await prisma.auditLog.findMany({
        where: { organizationId, entityId: created.body.id },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        AUDIT_TEAM_CREATED,
        AUDIT_TEAM_MEMBER_ADDED,
        AUDIT_TEAM_SUPERVISOR_CHANGED,
        AUDIT_TEAM_MEMBER_REMOVED,
      ]),
    );
  });

  it('assigns organization-defined skills and certifications', async () => {
    const { agent, organizationId } = await signupOrg('skills');
    const prisma = prismaFrom(app);
    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId, role: OrganizationRole.OWNER },
    });

    const skill = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/skills`),
    ).send({ name: 'Electrical' });
    expect(skill.status).toBe(201);

    const assigned = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/technicians/${owner.userId}/skills`),
    ).send({ skillId: skill.body.id });
    expect(assigned.status).toBe(201);

    const cert = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/technicians/${owner.userId}/certifications`,
      ),
    ).send({
      name: 'State License',
      certificateNumber: 'SL-1',
      expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    });
    expect(cert.status).toBe(201);
    expect(cert.body.status).toBe('EXPIRING_SOON');

    const profile = await agent.get(
      `/api/organizations/${organizationId}/technicians/${owner.userId}`,
    );
    expect(profile.status).toBe(200);
    expect(profile.body.skills.map((item: { name: string }) => item.name)).toContain(
      'Electrical',
    );
    expect(profile.body.email).toBeTruthy();
    expect(JSON.stringify(profile.body)).not.toMatch(/passwordHash/);

    const audits = (
      await prisma.auditLog.findMany({
        where: { organizationId, action: { in: [AUDIT_SKILL_ASSIGNED, AUDIT_CERTIFICATION_ADDED] } },
      })
    ).map((row) => row.action);
    expect(audits).toEqual(
      expect.arrayContaining([AUDIT_SKILL_ASSIGNED, AUDIT_CERTIFICATION_ADDED]),
    );
  });

  it('restricts technicians and supervisors to their own crews', async () => {
    const { agent: owner } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const hidden = await withCsrf(
      owner.post(`/api/organizations/${northstarId}/teams`),
    ).send({ name: `Hidden Crew ${Date.now()}`, code: `HID-${Date.now()}` });
    expect(hidden.status).toBe(201);

    const { agent: supervisor } = await loginAs(
      app,
      'riley.chen@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const visible = await supervisor.get(`/api/organizations/${northstarId}/teams`);
    expect(visible.status).toBe(200);
    expect(
      visible.body.items.some((item: { id: string }) => item.id === northstarTeamId),
    ).toBe(true);
    expect(
      visible.body.items.some((item: { id: string }) => item.id === hidden.body.id),
    ).toBe(false);

    const hiddenDetail = await supervisor.get(
      `/api/organizations/${northstarId}/teams/${hidden.body.id}`,
    );
    expect(hiddenDetail.status).toBe(404);
    expect(hiddenDetail.body).not.toHaveProperty('members');

    const own = await supervisor.get(
      `/api/organizations/${northstarId}/teams/${northstarTeamId}`,
    );
    expect(own.status).toBe(200);
    expect(own.body.supervisor.userId).toBe(rileyId);

    const { agent: technician } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const techCreate = await withCsrf(
      technician.post(`/api/organizations/${northstarId}/teams`),
    ).send({ name: 'Should Fail' });
    expect(techCreate.status).toBe(403);

    const techHidden = await technician.get(
      `/api/organizations/${northstarId}/teams/${hidden.body.id}`,
    );
    expect(techHidden.status).toBe(404);

    const peer = await technician.get(
      `/api/organizations/${northstarId}/technicians/${rileyId}`,
    );
    expect(peer.status).toBe(200);
    expect(peer.body.email).toBeNull();
    expect(peer.body.fullName).toBe('Riley Chen');

    const self = await technician.get(
      `/api/organizations/${northstarId}/technicians/${samId}`,
    );
    expect(self.status).toBe(200);
    expect(self.body.email).toBe('sam.ortega@northstar.fieldops.local');
  });

  it('never returns another organization team or technician by UUID', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const team = await agent.get(
      `/api/organizations/${northstarId}/teams/${bluepeakTeamId}`,
    );
    expect(team.status).toBe(404);
    expect(team.body).not.toHaveProperty('name');

    const viaForeignOrg = await agent.get(
      `/api/organizations/${bluepeakId}/teams/${bluepeakTeamId}`,
    );
    expect(viaForeignOrg.status).toBe(404);

    const ivy = await prismaFrom(app).user.findUniqueOrThrow({
      where: { email: 'ivy.march@bluepeak.fieldops.local' },
    });
    const technician = await agent.get(
      `/api/organizations/${northstarId}/technicians/${ivy.id}`,
    );
    expect(technician.status).toBe(404);
    expect(technician.body).not.toHaveProperty('email');
  });

  it('lets operations managers manage teams and blocks expired subscriptions', async () => {
    const { agent: ops } = await loginAs(
      app,
      'morgan.ellis@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const created = await withCsrf(
      ops.post(`/api/organizations/${northstarId}/teams`),
    ).send({ name: `Ops Crew ${Date.now()}`, code: `OPS-${Date.now()}` });
    expect(created.status).toBe(201);

    const { agent, organizationId } = await signupOrg('expired');
    const team = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams`),
    ).send({ name: 'Before expiry' });
    expect(team.status).toBe(201);

    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: new Date(Date.now() - 20 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 6 * 86_400_000),
        graceEndsAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });

    const list = await agent.get(`/api/organizations/${organizationId}/teams`);
    expect(list.status).toBe(200);
    expect(list.body.items[0].name).toBe('Before expiry');

    const mutate = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams`),
    ).send({ name: 'After expiry' });
    expect(mutate.status).toBe(403);
    expect(mutate.body.error).toBe('SUBSCRIPTION_READ_ONLY');
  });

  it('assigns a pending invitation team after the technician accepts', async () => {
    const { agent, organizationId } = await signupOrg('invite');
    const team = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/teams`),
    ).send({ name: 'Intake Crew', code: `IN-${Date.now()}` });
    expect(team.status).toBe(201);

    const email = `joined-${Date.now()}@teams.fieldops.test`;
    const invited = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/invitations`),
    ).send({
      email,
      role: OrganizationRole.TECHNICIAN,
      teamId: team.body.id,
    });
    expect(invited.status).toBe(201);
    expect(invited.body.teamId).toBe(team.body.id);

    const prisma = prismaFrom(app);
    const rawToken = generateUrlToken();
    await prisma.organizationInvitation.update({
      where: { id: invited.body.id },
      data: { tokenHash: hashToken(rawToken) },
    });

    const accepted = await withCsrf(
      api(app).post(`/api/invitations/${rawToken}/accept`),
    ).send({
      fullName: 'Joining Tech',
      password: SEED_PASSWORD,
    });
    expect(accepted.status).toBe(200);

    const membership = await prisma.teamMember.findFirst({
      where: {
        organizationId,
        teamId: team.body.id,
        user: { email },
      },
    });
    expect(membership).not.toBeNull();
  });
});
