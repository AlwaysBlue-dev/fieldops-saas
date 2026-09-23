import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  AUDIT_JOB_APPROVED,
  AUDIT_JOB_RETURNED,
  AUDIT_TIME_APPROVED,
  AUDIT_TIME_RETURNED,
} from '../src/common/constants.js';
import {
  JobPriority,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  SubscriptionStatus,
  TimeEntryStatus,
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

describe('Approvals center (e2e)', () => {
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
      email: `owner-${suffix}@appr.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Appr Owner ${label}`,
      organizationName: `Appr Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    const organizationId = signup.body.organization.id as string;
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: {
        requireClientSignature: false,
        allowManualTime: true,
        requireGps: false,
      },
    });
    return {
      agent,
      organizationId,
      ownerId: signup.body.user.id as string,
    };
  }

  async function addMember(
    organizationId: string,
    label: string,
    role: OrganizationRole,
  ) {
    const email = `${role.toLowerCase()}-${label}-${Date.now()}@appr.fieldops.test`;
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

  async function pendingJob(
    agent: ReturnType<typeof api>,
    organizationId: string,
    technicianUserId: string | null,
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
      technicianUserIds: technicianUserId ? [technicianUserId] : [],
      scheduledStart: new Date().toISOString(),
      expectedFinish: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      requireClientSignOff: false,
    });
    expect(created.status).toBe(201);
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/schedule`),
    ).send({
      scheduledStart: created.body.scheduledStart,
      expectedFinish: created.body.expectedFinish,
      technicianUserIds: technicianUserId ? [technicianUserId] : [],
      confirmOverlap: true,
    });
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/dispatch`),
    ).send({});
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/start`),
    ).send({});
    await withCsrf(
      agent.patch(`/api/organizations/${organizationId}/jobs/${created.body.id}/completion`),
    ).send({
      workPerformed: 'Isolated supply and completed panel inspection.',
      outcome: 'COMPLETED',
    });
    const submitted = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/submit`),
    ).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe(JobStatus.PENDING_APPROVAL);
    return submitted.body as { id: string; jobNumber: string };
  }

  async function pendingTime(
    agent: ReturnType<typeof api>,
    organizationId: string,
    jobId: string,
    extras: {
      userId?: string;
      type?: string;
      validation?: 'CLEAR' | 'BLOCKED';
      startTime?: string;
      endTime?: string;
    } = {},
  ) {
    const workDate = new Date();
    workDate.setUTCDate(workDate.getUTCDate() - 1);
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/timesheets/entries`),
    ).send({
      jobId,
      workDate: workDate.toISOString().slice(0, 10),
      type: extras.type ?? 'NORMAL',
      startTime: extras.startTime ?? '08:00',
      endTime: extras.endTime ?? '12:00',
      description: 'Panel inspection and functional tests.',
      userId: extras.userId,
    });
    expect(created.status).toBe(201);
    await prismaFrom(app).timeEntry.update({
      where: { id: created.body.id },
      data: {
        status: TimeEntryStatus.PENDING,
        validation:
          extras.validation === 'BLOCKED'
            ? {
                status: 'BLOCKED',
                checks: [
                  {
                    code: 'OVERTIME_UNAUTHORIZED',
                    severity: 'ERROR',
                    message: 'Overtime is not authorized',
                  },
                ],
              }
            : { status: 'CLEAR', checks: [] },
      },
    });
    return created.body as { id: string };
  }

  it(
    'approves and returns jobs through the action center with audit',
    async () => {
    const { agent, organizationId } = await signupOrg('job');
    const tech = await addMember(
      organizationId,
      'job',
      OrganizationRole.TECHNICIAN,
    );
    const job = await pendingJob(agent, organizationId, tech.user.id, 'Approve job');
    const listed = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    const approvalId = listed.body.items[0].id as string;
    const again = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    expect(again.body.items).toHaveLength(1);
    expect(again.body.items[0].id).toBe(approvalId);

    const detail = await agent.get(
      `/api/organizations/${organizationId}/approvals/${approvalId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.subject.job.jobNumber).toBe(job.jobNumber);
    expect(detail.body.subject.job.workPerformed).toContain('Isolated supply');

    const approved = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/approvals/${approvalId}/decide`),
    ).send({ decision: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    const completed = await agent.get(
      `/api/organizations/${organizationId}/jobs/${job.id}`,
    );
    expect(completed.body.status).toBe(JobStatus.COMPLETED);

    const duplicate = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/approvals/${approvalId}/decide`),
    ).send({ decision: 'APPROVED' });
    expect(duplicate.status).toBe(400);

    const returnedJob = await pendingJob(
      agent,
      organizationId,
      tech.user.id,
      'Return job',
    );
    const inbox = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    const returnId = inbox.body.items[0].id as string;
    const missing = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/approvals/${returnId}/decide`),
    ).send({ decision: 'RETURNED' });
    expect(missing.status).toBe(400);
    const returned = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/approvals/${returnId}/decide`),
    ).send({ decision: 'RETURNED', comment: 'Add the missing photos' });
    expect(returned.status).toBe(200);
    expect(returned.body.status).toBe('RETURNED');
    const card = await agent.get(
      `/api/organizations/${organizationId}/jobs/${returnedJob.id}`,
    );
    expect(card.body.status).toBe(JobStatus.RETURNED);
    expect(card.body.returnReason).toBe('Add the missing photos');

    const actions = (
      await prismaFrom(app).auditLog.findMany({
        where: { organizationId, entityType: 'Job' },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([AUDIT_JOB_APPROVED, AUDIT_JOB_RETURNED]),
    );
  },
    90_000,
  );

  it('blocks self-approval, wrong team, cross-tenant, stale, and missing signature', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('guards');
    const ownJob = await pendingJob(agent, organizationId, ownerId, 'Self job');
    const ownInbox = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    const selfDecide = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/approvals/${ownInbox.body.items[0].id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(selfDecide.status).toBe(403);

    const techA = await addMember(
      organizationId,
      'teama',
      OrganizationRole.TECHNICIAN,
    );
    const techB = await addMember(
      organizationId,
      'teamb',
      OrganizationRole.TECHNICIAN,
    );
    const supervisor = await addMember(
      organizationId,
      'sup',
      OrganizationRole.SUPERVISOR,
    );
    const prisma = prismaFrom(app);
    const teamA = await prisma.team.create({
      data: {
        organizationId,
        name: `Team A ${Date.now()}`,
        supervisorUserId: supervisor.user.id,
      },
    });
    await prisma.teamMember.create({
      data: {
        organizationId,
        teamId: teamA.id,
        userId: techA.user.id,
      },
    });
    const teamB = await prisma.team.create({
      data: {
        organizationId,
        name: `Team B ${Date.now()}`,
      },
    });
    await prisma.teamMember.create({
      data: {
        organizationId,
        teamId: teamB.id,
        userId: techB.user.id,
      },
    });
    const foreignJob = await pendingJob(
      agent,
      organizationId,
      techB.user.id,
      'Other team',
    );
    await prisma.job.update({
      where: { id: foreignJob.id },
      data: { teamId: teamB.id },
    });
    const { agent: supervisorAgent } = await loginAs(
      app,
      supervisor.email,
      SEED_PASSWORD,
    );
    const supervisorInbox = await supervisorAgent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    expect(
      supervisorInbox.body.items.some(
        (item: { subjectId: string }) => item.subjectId === foreignJob.id,
      ),
    ).toBe(false);
    const ownerInbox = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    const otherTeamApproval = ownerInbox.body.items.find(
      (item: { subjectId: string }) => item.subjectId === foreignJob.id,
    );
    expect(otherTeamApproval).toBeTruthy();
    const wrongTeam = await withCsrf(
      supervisorAgent.post(
        `/api/organizations/${organizationId}/approvals/${otherTeamApproval.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(wrongTeam.status).toBe(404);

    const { agent: foreign } = await loginAs(
      app,
      'dana.brooks@bluepeak.fieldops.local',
      SEED_PASSWORD,
    );
    const cross = await withCsrf(
      foreign.post(
        `/api/organizations/${bluepeakId}/approvals/${otherTeamApproval.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(cross.status).toBe(404);

    const staleJob = await pendingJob(agent, organizationId, techA.user.id, 'Stale');
    const staleInbox = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    const staleApproval = staleInbox.body.items.find(
      (item: { subjectId: string }) => item.subjectId === staleJob.id,
    );
    await prisma.job.update({
      where: { id: staleJob.id },
      data: { status: JobStatus.COMPLETED },
    });
    const stale = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/approvals/${staleApproval.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(stale.status).toBe(400);

    const unsigned = await pendingJob(
      agent,
      organizationId,
      techA.user.id,
      'Unsigned',
    );
    await prisma.job.update({
      where: { id: unsigned.id },
      data: { requireClientSignOff: true },
    });
    await prisma.organizationSettings.update({
      where: { organizationId },
      data: { requireClientSignature: true },
    });
    const unsignedInbox = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=JOB_COMPLETION`,
    );
    const unsignedApproval = unsignedInbox.body.items.find(
      (item: { subjectId: string }) => item.subjectId === unsigned.id,
    );
    const missingSig = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/approvals/${unsignedApproval.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(missingSig.status).toBe(400);
    expect(String(missingSig.body.message)).toMatch(/signature/i);

    const { agent: techAgent } = await loginAs(app, techA.email, SEED_PASSWORD);
    const techDecide = await withCsrf(
      techAgent.post(
        `/api/organizations/${organizationId}/approvals/${unsignedApproval.id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(techDecide.status).toBe(403);
  });

  it('blocks blocked timesheets, allows return, and bulk-approves only CLEAR pending items', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('time');
    const tech = await addMember(
      organizationId,
      'time',
      OrganizationRole.TECHNICIAN,
    );
    const job = await pendingJob(agent, organizationId, tech.user.id, 'Time job');
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/return`),
    ).send({ reason: 'Need a time record first' });
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/resume`),
    ).send({});

    const clearA = await pendingTime(agent, organizationId, job.id, {
      userId: tech.user.id,
      validation: 'CLEAR',
      startTime: '08:00',
      endTime: '10:00',
    });
    const clearB = await pendingTime(agent, organizationId, job.id, {
      userId: tech.user.id,
      validation: 'CLEAR',
      startTime: '10:30',
      endTime: '12:30',
    });
    const blocked = await pendingTime(agent, organizationId, job.id, {
      userId: tech.user.id,
      validation: 'BLOCKED',
      startTime: '13:00',
      endTime: '14:00',
    });
    const ownTime = await pendingTime(agent, organizationId, job.id, {
      userId: ownerId,
      validation: 'CLEAR',
      startTime: '08:00',
      endTime: '10:00',
    });

    const inbox = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=TIMESHEET`,
    );
    expect(inbox.status).toBe(200);
    const bySubject = Object.fromEntries(
      inbox.body.items.map((item: { subjectId: string; id: string }) => [
        item.subjectId,
        item.id,
      ]),
    );
    const blockedDecide = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/approvals/${bySubject[blocked.id]}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(blockedDecide.status).toBe(400);

    const returned = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/approvals/${bySubject[blocked.id]}/decide`,
      ),
    ).send({ decision: 'RETURNED', comment: 'Need an overtime grant' });
    expect(returned.status).toBe(200);
    expect(returned.body.status).toBe('RETURNED');

    const selfTime = await withCsrf(
      agent.post(
        `/api/organizations/${organizationId}/approvals/${bySubject[ownTime.id]}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(selfTime.status).toBe(403);

    const bulk = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/approvals/bulk-timesheets`),
    ).send({
      approvalIds: [
        bySubject[clearA.id],
        bySubject[clearB.id],
        bySubject[blocked.id],
        bySubject[ownTime.id],
        '00000000-0000-4000-8000-000000000099',
      ],
    });
    expect(bulk.status).toBe(200);
    const statuses = Object.fromEntries(
      bulk.body.results.map(
        (row: { approvalId: string; status: string }) => [
          row.approvalId,
          row.status,
        ],
      ),
    );
    expect(statuses[bySubject[clearA.id]]).toBe('APPROVED');
    expect(statuses[bySubject[clearB.id]]).toBe('APPROVED');
    expect(statuses[bySubject[blocked.id]]).not.toBe('APPROVED');
    expect(statuses[bySubject[ownTime.id]]).not.toBe('APPROVED');

    const actions = (
      await prismaFrom(app).auditLog.findMany({
        where: { organizationId, entityType: 'TimeEntry' },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([AUDIT_TIME_APPROVED, AUDIT_TIME_RETURNED]),
    );
  });

  it('surfaces overtime in the same inbox and blocks expired-subscription writes', async () => {
    const { agent, organizationId } = await signupOrg('ot');
    const tech = await addMember(organizationId, 'ot', OrganizationRole.TECHNICIAN);
    const job = await pendingJob(agent, organizationId, tech.user.id, 'OT job');
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/return`),
    ).send({ reason: 'Need overtime first' });
    await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${job.id}/resume`),
    ).send({});
    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const workDate = new Date();
    workDate.setUTCDate(workDate.getUTCDate() - 1);
    const requested = await withCsrf(
      techAgent.post(`/api/organizations/${organizationId}/overtime-authorizations`),
    ).send({
      jobId: job.id,
      workDate: workDate.toISOString().slice(0, 10),
      startTime: '17:00',
      endTime: '20:00',
      maxMinutes: 120,
      reason: 'Storm restoration after normal hours.',
    });
    expect(requested.status).toBe(201);
    const inbox = await agent.get(
      `/api/organizations/${organizationId}/approvals?type=OVERTIME`,
    );
    expect(inbox.body.items).toHaveLength(1);
    const approvalId = inbox.body.items[0].id as string;
    const approved = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/approvals/${approvalId}/decide`),
    ).send({ decision: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');

    const { organizationId: expiredId, agent: expiredAgent } =
      await signupOrg('expired');
    const expiredTech = await addMember(
      expiredId,
      'expired',
      OrganizationRole.TECHNICIAN,
    );
    const expiredJob = await pendingJob(
      expiredAgent,
      expiredId,
      expiredTech.user.id,
      'Expired job',
    );
    const expiredInbox = await expiredAgent.get(
      `/api/organizations/${expiredId}/approvals?type=JOB_COMPLETION`,
    );
    const prisma = prismaFrom(app);
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: expiredId },
    });
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.EXPIRED,
        currentPeriodEnd: new Date(Date.now() - 8 * 86_400_000),
      },
    });
    const blocked = await withCsrf(
      expiredAgent.post(
        `/api/organizations/${expiredId}/approvals/${expiredInbox.body.items[0].id}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(blocked.status).toBe(403);
    expect(expiredJob.id).toBeTruthy();
  });
});
