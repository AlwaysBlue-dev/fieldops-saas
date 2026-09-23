import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  JobPriority,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  TimeEntrySource,
  TimeEntryStatus,
  TimeEntryType,
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

describe('Reports (e2e)', () => {
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
      email: `owner-${suffix}@report.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Report Owner ${label}`,
      organizationName: `Report Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId: signup.body.organization.id },
      data: {
        requireClientSignature: false,
        requireGps: false,
        allowManualTime: true,
      },
    });
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
    const email = `${role.toLowerCase()}-${label}-${Date.now()}@report.fieldops.test`;
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

  async function seedJob(
    organizationId: string,
    technicianUserId: string,
    extras: { title?: string; status?: JobStatus } = {},
  ) {
    const prisma = prismaFrom(app);
    const client = await prisma.client.create({
      data: { organizationId, name: `Client ${extras.title ?? 'A'}` },
    });
    const site = await prisma.site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: `Site ${extras.title ?? 'A'}`,
        city: 'Chicago',
        country: 'US',
      },
    });
    const counter = await prisma.organizationCounter.upsert({
      where: { organizationId },
      update: { jobNext: { increment: 1 } },
      create: { organizationId, jobNext: 2 },
    });
    const job = await prisma.job.create({
      data: {
        organizationId,
        jobNumber: `R-${counter.jobNext - 1}`,
        title: extras.title ?? 'Report job',
        clientId: client.id,
        siteId: site.id,
        jobType: 'SERVICE_CALL',
        priority: JobPriority.NORMAL,
        status: extras.status ?? JobStatus.COMPLETED,
        scheduledStart: new Date(),
        expectedFinish: new Date(Date.now() + 2 * 60 * 60 * 1000),
        completedAt:
          extras.status === JobStatus.CANCELLED ? null : new Date(),
        workPerformed: 'Replaced contactor and verified amp draw.',
        requireClientSignOff: false,
      },
    });
    await prisma.jobAssignment.create({
      data: {
        organizationId,
        jobId: job.id,
        userId: technicianUserId,
      },
    });
    const workDate = new Date();
    workDate.setUTCHours(0, 0, 0, 0);
    await prisma.timeEntry.create({
      data: {
        organizationId,
        userId: technicianUserId,
        jobId: job.id,
        workDate,
        startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        endedAt: new Date(Date.now() - 60 * 60 * 1000),
        durationMinutes: 120,
        type: TimeEntryType.NORMAL,
        source: TimeEntrySource.MANUAL,
        status: TimeEntryStatus.APPROVED,
        notes: '=HYPERLINK("http://evil")',
      },
    });
    return { job, client, site };
  }

  it('isolates reports by tenant and scopes technicians', async () => {
    const a = await signupOrg('a');
    const b = await signupOrg('b');
    const techA = await addMember(
      a.organizationId,
      'a',
      OrganizationRole.TECHNICIAN,
    );
    const techB = await addMember(
      b.organizationId,
      'b',
      OrganizationRole.TECHNICIAN,
    );
    const seededA = await seedJob(a.organizationId, techA.user.id, {
      title: 'A job',
    });
    await seedJob(b.organizationId, techB.user.id, { title: 'B job' });

    const summary = await a.agent.get(
      `/api/organizations/${a.organizationId}/reports/summary`,
    );
    expect(summary.status).toBe(200);
    expect(summary.body.kpis.completedJobs).toBeGreaterThanOrEqual(1);

    const foreign = await a.agent.get(
      `/api/organizations/${b.organizationId}/reports/summary`,
    );
    expect(foreign.status).toBe(404);

    const { agent: techAgent } = await loginAs(app, techA.email, SEED_PASSWORD);
    const techJobs = await techAgent.get(
      `/api/organizations/${a.organizationId}/reports/jobs`,
    );
    expect(techJobs.status).toBe(200);
    expect(
      techJobs.body.items.every(
        (row: { technicians: Array<{ userId: string }> }) =>
          row.technicians.some((t) => t.userId === techA.user.id),
      ),
    ).toBe(true);

    const csv = await a.agent.get(
      `/api/organizations/${a.organizationId}/reports/exports/timesheets.csv`,
    );
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/csv/);
    expect(csv.text).toContain("'=HYPERLINK");

    const pdf = await a.agent.get(
      `/api/organizations/${a.organizationId}/reports/jobs/${seededA.job.id}/pdf`,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect(Buffer.isBuffer(pdf.body) || pdf.body.length > 100).toBeTruthy();

    const stolen = await a.agent.get(
      `/api/organizations/${a.organizationId}/reports/jobs/${(
        await prismaFrom(app).job.findFirstOrThrow({
          where: { organizationId: b.organizationId },
        })
      ).id}/pdf`,
    );
    expect(stolen.status).toBe(404);
  });

  it('applies filters and timezone-aware labour aggregates', async () => {
    const { agent, organizationId } = await signupOrg('filter');
    const tech = await addMember(
      organizationId,
      'filter',
      OrganizationRole.TECHNICIAN,
    );
    const { client, job } = await seedJob(organizationId, tech.user.id, {
      title: 'Filter job',
      status: JobStatus.IN_PROGRESS,
    });
    await prismaFrom(app).job.update({
      where: { id: job.id },
      data: { status: JobStatus.IN_PROGRESS, completedAt: null },
    });

    const status = await agent.get(
      `/api/organizations/${organizationId}/reports/job-status`,
    );
    expect(status.status).toBe(200);
    expect(status.body.counts.IN_PROGRESS).toBeGreaterThanOrEqual(1);

    const filtered = await agent.get(
      `/api/organizations/${organizationId}/reports/jobs`,
    ).query({
      clientId: client.id,
      status: JobStatus.IN_PROGRESS,
    });
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.length).toBeGreaterThanOrEqual(1);
    expect(
      filtered.body.items.every(
        (row: { client: { id: string }; status: string }) =>
          row.client.id === client.id && row.status === JobStatus.IN_PROGRESS,
      ),
    ).toBe(true);

    const labour = await agent.get(
      `/api/organizations/${organizationId}/reports/labour`,
    );
    expect(labour.status).toBe(200);
    expect(labour.body.totals.totalMinutes).toBeGreaterThanOrEqual(120);
    expect(labour.body.byTechnician[0].minutes).toBeGreaterThanOrEqual(120);
  });
});
