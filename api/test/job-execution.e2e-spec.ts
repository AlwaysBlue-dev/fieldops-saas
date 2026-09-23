import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_COMPLETION_SUMMARY_UPDATED,
  AUDIT_JOB_MATERIAL,
  AUDIT_JOB_SUBMITTED,
  AUDIT_JOB_WORK_LOG,
  AUDIT_SAFETY_CONTROL_CONFIRMED,
} from '../src/common/constants.js';
import {
  ClockSessionStatus,
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

describe('Job execution (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let bluepeakJobId = '';

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
    bluepeakJobId = (
      await prisma.job.findFirstOrThrow({
        where: { organizationId: bluepeakId },
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
      email: `owner-${suffix}@exec.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Exec Owner ${label}`,
      organizationName: `Exec Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    const organizationId = signup.body.organization.id as string;
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireClientSignature: false },
    });
    return {
      agent,
      organizationId,
      ownerId: signup.body.user.id as string,
    };
  }

  async function addTechnician(organizationId: string, label: string) {
    const prisma = prismaFrom(app);
    const email = `tech-${label}-${Date.now()}@exec.fieldops.test`;
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
    return started.body as { id: string; client: { id: string; name: string } };
  }

  async function writeCompletion(
    agent: ReturnType<typeof api>,
    organizationId: string,
    jobId: string,
    extra: Record<string, unknown> = {},
  ) {
    return withCsrf(
      agent.patch(`/api/organizations/${organizationId}/jobs/${jobId}/completion`),
    ).send({
      workPerformed: 'Isolated supply and completed panel inspection.',
      outcome: 'COMPLETED',
      ...extra,
    });
  }

  it('isolates tenants and assigned technicians', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('iso');
    const assigned = await addTechnician(organizationId, 'assigned');
    const outsider = await addTechnician(organizationId, 'out');
    const job = await inProgressJob(agent, organizationId, assigned.user.id, 'Tenant job');

    const { agent: assignedAgent } = await loginAs(app, assigned.email, SEED_PASSWORD);
    const visible = await assignedAgent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}`,
    );
    expect(visible.status).toBe(200);
    expect(visible.body.safetyControls).toHaveLength(3);

    const { agent: outsiderAgent } = await loginAs(app, outsider.email, SEED_PASSWORD);
    const hidden = await outsiderAgent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}`,
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body).not.toHaveProperty('jobNumber');

    const sneakLog = await withCsrf(
      outsiderAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/work-logs`),
    ).send({ text: 'Should not persist' });
    expect(sneakLog.status).toBe(404);

    const { agent: northstar } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const foreign = await northstar.get(
      `/api/organizations/${northstarId}/jobs/${bluepeakJobId}`,
    );
    expect(foreign.status).toBe(404);

    const ownerRead = await agent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}`,
    );
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.client.name).toBeTruthy();
    expect(ownerId).toBeTruthy();
  });

  it('confirms safety on the server and blocks submit until satisfied', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('safety');
    const tech = await addTechnician(organizationId, 'safety');
    const job = await inProgressJob(
      agent,
      organizationId,
      tech.user.id,
      'LOTO job',
      { requireLoto: true, requireRiskAssessment: true },
    );
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);

    const fake = await withCsrf(
      techAgent.post(
        `/api/organizations/${organizationId}/jobs/${job.id}/safety/LOTO/confirm`,
      ),
    ).send({ note: 'Isolated' });
    expect(fake.status).toBe(200);
    expect(fake.body.status).toBe('CONFIRMED');
    expect(fake.body.confirmedBy.userId).toBe(tech.user.id);

    await writeCompletion(techAgent, organizationId, job.id);
    const blocked = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/safety/i);

    await withCsrf(
      techAgent.post(
        `/api/organizations/${organizationId}/jobs/${job.id}/safety/RISK_ASSESSMENT/confirm`,
      ),
    ).send({});
    const submitted = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe(JobStatus.PENDING_APPROVAL);

    const again = await withCsrf(
      techAgent.post(
        `/api/organizations/${organizationId}/jobs/${job.id}/safety/LOTO/confirm`,
      ),
    ).send({});
    expect(again.status).toBe(400);
    expect(ownerId).toBeTruthy();
  });

  it('records work logs and materials, then locks them after submit', async () => {
    const { agent, organizationId } = await signupOrg('records');
    const tech = await addTechnician(organizationId, 'records');
    const other = await addTechnician(organizationId, 'other-mat');
    const job = await inProgressJob(agent, organizationId, tech.user.id, 'Materials job');
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);

    const log = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/work-logs`),
    ).send({ text: 'Arrived onsite and met client representative.' });
    expect(log.status).toBe(201);
    expect(log.body.text).toMatch(/Arrived onsite/);

    const edited = await withCsrf(
      techAgent.patch(
        `/api/organizations/${organizationId}/jobs/${job.id}/work-logs/${log.body.id}`,
      ),
    ).send({ text: 'Arrived onsite, isolated supply, and inspected the panel.' });
    expect(edited.status).toBe(200);

    const material = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/materials`),
    ).send({
      itemName: 'Contactor',
      partNumber: 'C-90',
      quantity: 2,
      unit: 'ea',
      notes: 'Replaced damaged unit',
    });
    expect(material.status).toBe(201);
    expect(material.body.itemName).toBe('Contactor');
    expect(material.body.partNumber).toBe('C-90');

    const { agent: otherAgent } = await loginAs(app, other.email, SEED_PASSWORD);
    const steal = await withCsrf(
      otherAgent.patch(
        `/api/organizations/${organizationId}/jobs/${job.id}/materials/${material.body.id}`,
      ),
    ).send({ quantity: 9 });
    expect([403, 404]).toContain(steal.status);

    const updated = await withCsrf(
      techAgent.patch(
        `/api/organizations/${organizationId}/jobs/${job.id}/materials/${material.body.id}`,
      ),
    ).send({ quantity: 3, unit: 'pcs' });
    expect(updated.status).toBe(200);
    expect(Number(updated.body.quantity)).toBe(3);

    await writeCompletion(techAgent, organizationId, job.id);
    const submitted = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(submitted.status).toBe(200);

    const lockedLog = await withCsrf(
      techAgent.patch(
        `/api/organizations/${organizationId}/jobs/${job.id}/work-logs/${log.body.id}`,
      ),
    ).send({ text: 'Silent rewrite after submit' });
    expect(lockedLog.status).toBe(400);

    const lockedMat = await withCsrf(
      techAgent.delete(
        `/api/organizations/${organizationId}/jobs/${job.id}/materials/${material.body.id}`,
      ),
    ).send({});
    expect(lockedMat.status).toBe(400);

    const actions = (
      await prismaFrom(app).auditLog.findMany({
        where: { organizationId, entityId: job.id },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        AUDIT_JOB_WORK_LOG,
        AUDIT_JOB_MATERIAL,
        AUDIT_COMPLETION_SUMMARY_UPDATED,
        AUDIT_JOB_SUBMITTED,
      ]),
    );
  });

  it('rejects illegal transitions and incomplete submission', async () => {
    const { agent, organizationId } = await signupOrg('submit');
    const tech = await addTechnician(organizationId, 'submit');
    const job = await inProgressJob(agent, organizationId, tech.user.id, 'Submit job');
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);

    const jump = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/complete`),
    ).send({});
    expect(jump.status).toBe(403);

    const noWork = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(noWork.status).toBe(400);

    const followUp = await withCsrf(
      techAgent.patch(`/api/organizations/${organizationId}/jobs/${job.id}/completion`),
    ).send({
      workPerformed: 'Could not finish the replacement today.',
      outcome: 'FOLLOW_UP_REQUIRED',
    });
    expect(followUp.status).toBe(400);

    await writeCompletion(techAgent, organizationId, job.id, {
      outcome: 'FOLLOW_UP_REQUIRED',
      outcomeReason: 'Parts arrive tomorrow',
    });

    await prismaFrom(app).clockSession.create({
      data: {
        organizationId,
        technicianUserId: tech.user.id,
        jobId: job.id,
        clockInAt: new Date(),
        status: ClockSessionStatus.OPEN,
      },
    });
    const clocked = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(clocked.status).toBe(400);
    expect(clocked.body.message).toMatch(/clock out/i);

    await prismaFrom(app).clockSession.updateMany({
      where: { organizationId, jobId: job.id },
      data: { status: ClockSessionStatus.CLOSED, clockOutAt: new Date() },
    });

    const contact = await withCsrf(
      techAgent.patch(
        `/api/organizations/${organizationId}/jobs/${job.id}/client-contact`,
      ),
    ).send({
      representativeName: 'Dana Ruiz',
      representativeRole: 'Facilities',
      representativePhone: '312-555-0100',
    });
    expect(contact.status).toBe(200);
    expect(contact.body.representativeName).toBe('Dana Ruiz');
    const master = await prismaFrom(app).client.findFirstOrThrow({
      where: { id: job.client.id },
    });
    expect(master.primaryContactName).not.toBe('Dana Ruiz');

    const submitted = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(submitted.status).toBe(200);

    const activity = await techAgent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}/activity`,
    );
    expect(activity.status).toBe(200);
    expect(activity.body.some((row: { action: string }) => row.action === 'JOB_SUBMITTED')).toBe(
      true,
    );
  });

  it('keeps expired subscriptions read-only for execution writes', async () => {
    const { agent, organizationId } = await signupOrg('readonly');
    const tech = await addTechnician(organizationId, 'readonly');
    const job = await inProgressJob(agent, organizationId, tech.user.id, 'Readonly job');
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);

    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: new Date(Date.now() - 20 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 6 * 86_400_000),
        graceEndsAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });

    const readable = await techAgent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}`,
    );
    expect(readable.status).toBe(200);

    const log = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/work-logs`),
    ).send({ text: 'Should be blocked' });
    expect(log.status).toBe(403);
    expect(log.body.error).toBe('SUBSCRIPTION_READ_ONLY');

    const safety = await withCsrf(
      techAgent.post(
        `/api/organizations/${organizationId}/jobs/${job.id}/safety/LOTO/confirm`,
      ),
    ).send({});
    expect(safety.status).toBe(403);

    const material = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/materials`),
    ).send({ itemName: 'Fuse', quantity: 1, unit: 'ea' });
    expect(material.status).toBe(403);

    const submit = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/jobs/${job.id}/submit`),
    ).send({});
    expect(submit.status).toBe(403);
  });

  it('writes a safety confirmation audit event', async () => {
    const { agent, organizationId } = await signupOrg('audit');
    const tech = await addTechnician(organizationId, 'audit');
    const job = await inProgressJob(
      agent,
      organizationId,
      tech.user.id,
      'Audit job',
      { requirePermit: true },
    );
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    await withCsrf(
      techAgent.post(
        `/api/organizations/${organizationId}/jobs/${job.id}/safety/PERMIT/confirm`,
      ),
    ).send({ note: 'Permit on site' });
    const actions = (
      await prismaFrom(app).auditLog.findMany({
        where: { organizationId, entityId: job.id },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toContain(AUDIT_SAFETY_CONTROL_CONFIRMED);
  });
});
