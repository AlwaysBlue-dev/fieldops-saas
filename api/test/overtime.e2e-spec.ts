import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  JobPriority,
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

describe('Overtime authorization (e2e)', () => {
  let app: INestApplication<App>;
  let bluepeakId = '';

  beforeAll(async () => {
    app = await createTestApp();
    bluepeakId = (
      await prismaFrom(app).organization.findUniqueOrThrow({
        where: { slug: 'bluepeak-hvac' },
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
      email: `owner-${suffix}@ot.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `OT Owner ${label}`,
      organizationName: `OT Co ${suffix}`,
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

  async function addMember(
    organizationId: string,
    label: string,
    role: OrganizationRole,
  ) {
    const email = `${role.toLowerCase()}-${label}-${Date.now()}@ot.fieldops.test`;
    const user = await prismaFrom(app).user.create({
      data: {
        email,
        fullName: `${role} ${label}`,
        passwordHash: await hash(SEED_PASSWORD, 4),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    await prismaFrom(app).organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role,
        status: MembershipStatus.ACTIVE,
      },
    });
    return { user, email };
  }

  async function openJob(
    agent: ReturnType<typeof api>,
    organizationId: string,
    technicianUserId: string,
    title: string,
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
    return created.body as { id: string };
  }

  function yesterdayYmd() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  async function approvedGrant(
    agent: ReturnType<typeof api>,
    techAgent: ReturnType<typeof api>,
    organizationId: string,
    jobId: string,
    extras: { workDate?: string; startTime?: string; endTime?: string; maxMinutes?: number } = {},
  ) {
    const workDate = extras.workDate ?? yesterdayYmd();
    const requested = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/overtime-authorizations`),
    ).send({
      jobId,
      workDate,
      startTime: extras.startTime ?? '17:00',
      endTime: extras.endTime ?? '20:00',
      maxMinutes: extras.maxMinutes ?? 120,
      reason: 'Storm restoration after normal hours.',
    });
    expect(requested.status).toBe(201);
    expect(requested.body.status).toBe('PENDING');
    const approved = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/overtime-authorizations/${requested.body.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    return approved.body as { id: string; workDate: string };
  }

  it('requires an approved matching authorization before overtime time is accepted', async () => {
    const { agent, organizationId } = await signupOrg('cover');
    const tech = await addMember(
      organizationId,
      'cover',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'OT job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true, allowOvertimeRequests: true },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const workDate = yesterdayYmd();

    const blocked = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate,
      type: 'OVERTIME',
      startTime: '17:00',
      endTime: '18:00',
      description: 'Overtime without a grant should be blocked.',
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'OVERTIME_UNAUTHORIZED',
    );

    const grant = await approvedGrant(agent, techAgent, organizationId, job.id, {
      workDate,
    });

    const created = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate,
      type: 'OVERTIME',
      startTime: '17:00',
      endTime: '18:00',
      description: 'Authorized evening overtime block.',
      overtimeAuthorizationId: grant.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.overtimeAuthorization.id).toBe(grant.id);
    expect(created.body.validation.status).not.toBe('BLOCKED');
  });

  it('rejects wrong technician, job, date, window, and over-cap reuse', async () => {
    const { agent, organizationId } = await signupOrg('rules');
    const tech = await addMember(
      organizationId,
      'rules',
      OrganizationRole.TECHNICIAN,
    );
    const other = await addMember(
      organizationId,
      'other',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Rules OT');
    const otherJob = await openJob(agent, organizationId, tech.user.id, 'Other job');
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { allowManualTime: true, allowOvertimeRequests: true },
    });
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const workDate = yesterdayYmd();
    const grant = await approvedGrant(agent, techAgent, organizationId, job.id, {
      workDate,
      maxMinutes: 90,
    });

    const wrongTech = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      userId: other.user.id,
      workDate,
      type: 'OVERTIME',
      startTime: '17:00',
      endTime: '18:00',
      description: 'Wrong technician cannot consume this grant.',
      overtimeAuthorizationId: grant.id,
    });
    expect(wrongTech.status).toBe(400);
    expect(wrongTech.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'OVERTIME_WRONG_TECHNICIAN',
    );

    const wrongJob = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: otherJob.id,
      workDate,
      type: 'OVERTIME',
      startTime: '17:00',
      endTime: '18:00',
      description: 'Wrong job cannot consume this grant.',
      overtimeAuthorizationId: grant.id,
    });
    expect(wrongJob.status).toBe(400);
    expect(wrongJob.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'OVERTIME_WRONG_JOB',
    );

    const earlier = new Date(`${workDate}T00:00:00.000Z`);
    earlier.setUTCDate(earlier.getUTCDate() - 1);
    const wrongDate = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate: earlier.toISOString().slice(0, 10),
      type: 'OVERTIME',
      startTime: '17:00',
      endTime: '18:00',
      description: 'Wrong date cannot consume this grant.',
      overtimeAuthorizationId: grant.id,
    });
    expect(wrongDate.status).toBe(400);
    expect(wrongDate.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'OVERTIME_WRONG_DATE',
    );

    const outside = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate,
      type: 'OVERTIME',
      startTime: '14:00',
      endTime: '15:00',
      description: 'Outside the authorized overtime window.',
      overtimeAuthorizationId: grant.id,
    });
    expect(outside.status).toBe(400);
    expect(outside.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'OVERTIME_OUTSIDE_WINDOW',
    );

    const first = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate,
      type: 'OVERTIME',
      startTime: '17:00',
      endTime: '18:00',
      description: 'First authorized overtime hour.',
      overtimeAuthorizationId: grant.id,
    });
    expect(first.status).toBe(201);

    const second = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId: job.id,
      workDate,
      type: 'OVERTIME',
      startTime: '18:00',
      endTime: '19:30',
      description: 'Second block exceeds remaining authorized minutes.',
      overtimeAuthorizationId: grant.id,
    });
    expect(second.status).toBe(400);
    expect(second.body.validation.checks.map((item: { code: string }) => item.code)).toContain(
      'OVERTIME_EXCEEDS_MAX',
    );
  });

  it('enforces tenant isolation, roles, and expired-subscription writes', async () => {
    const { agent, organizationId } = await signupOrg('scope');
    const tech = await addMember(
      organizationId,
      'scope',
      OrganizationRole.TECHNICIAN,
    );
    const job = await openJob(agent, organizationId, tech.user.id, 'Scope OT');
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const requested = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/overtime-authorizations`),
    ).send({
      jobId: job.id,
      workDate: yesterdayYmd(),
      startTime: '17:00',
      endTime: '19:00',
      maxMinutes: 90,
      reason: 'After-hours generator repair.',
    });
    expect(requested.status).toBe(201);

    const selfApprove = await withCsrf(
      techAgent.post(
        `/api/organizations/${organizationId}/overtime-authorizations/${requested.body.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(selfApprove.status).toBe(403);

    const missingComment = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/overtime-authorizations/${requested.body.id}/decide`,
      ),
    ).send({ decision: 'REJECTED' });
    expect(missingComment.status).toBe(400);

    const { agent: sam } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const cross = await sam.get(
      `/api/organizations/${bluepeakId}/overtime-authorizations`,
    );
    expect(cross.status).toBe(404);

    const foreign = await sam.get(
      `/api/organizations/${organizationId}/overtime-authorizations/${requested.body.id}`,
    );
    expect([401, 403, 404]).toContain(foreign.status);

    const hidden = await sam.get(
      `/api/organizations/${bluepeakId}/overtime-authorizations/${requested.body.id}`,
    );
    expect(hidden.status).toBe(404);

    await prismaFrom(app).subscription.update({
      where: { organizationId },
      data: {
        status: SubscriptionStatus.TRIAL_EXPIRED,
        trialEndsAt: new Date(Date.now() - 4 * 86400000),
        graceEndsAt: new Date(Date.now() - 86400000),
      },
    });
    const readable = await agent.get(
      `/api/organizations/${organizationId}/overtime-authorizations`,
    );
    expect(readable.status).toBe(200);
    const write = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/overtime-authorizations/${requested.body.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(write.status).toBe(403);
  });
});
