import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { ApprovalType } from '../src/generated/prisma/client.js';
import {
  api,
  createTestApp,
  loginAs,
  prismaFrom,
  withCsrf,
} from './helpers/create-app.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'FieldOps.Dev!2026';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let bluepeakJobId = '';
  let bluepeakClientId = '';
  let bluepeakFileId = '';
  let bluepeakApprovalId = '';
  let northstarApprovalId = '';
  let northstarJobId = '';

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = prismaFrom(app);

    const northstar = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'northstar-electrical' },
    });
    const bluepeak = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'bluepeak-hvac' },
    });
    northstarId = northstar.id;
    bluepeakId = bluepeak.id;

    const northstarJob = await prisma.job.findFirstOrThrow({
      where: { organizationId: northstarId },
    });
    const bluepeakJob = await prisma.job.findFirstOrThrow({
      where: { organizationId: bluepeakId },
    });
    northstarJobId = northstarJob.id;
    bluepeakJobId = bluepeakJob.id;

    const bluepeakClient = await prisma.client.findFirstOrThrow({
      where: { organizationId: bluepeakId },
    });
    bluepeakClientId = bluepeakClient.id;

    const bluepeakFile = await prisma.jobFile.findFirstOrThrow({
      where: { organizationId: bluepeakId },
    });
    bluepeakFileId = bluepeakFile.id;

    const northstarOwner = await prisma.user.findUniqueOrThrow({
      where: { email: 'jordan.hale@northstar.fieldops.local' },
    });
    const bluepeakOwner = await prisma.user.findUniqueOrThrow({
      where: { email: 'dana.brooks@bluepeak.fieldops.local' },
    });

    const northstarApproval = await prisma.approval.upsert({
      where: {
        organizationId_type_subjectId: {
          organizationId: northstarId,
          type: ApprovalType.JOB_COMPLETION,
          subjectId: northstarJobId,
        },
      },
      create: {
        organizationId: northstarId,
        type: ApprovalType.JOB_COMPLETION,
        subjectType: 'Job',
        subjectId: northstarJobId,
        requestedByUserId: northstarOwner.id,
      },
      update: {},
    });
    const bluepeakApproval = await prisma.approval.upsert({
      where: {
        organizationId_type_subjectId: {
          organizationId: bluepeakId,
          type: ApprovalType.JOB_COMPLETION,
          subjectId: bluepeakJobId,
        },
      },
      create: {
        organizationId: bluepeakId,
        type: ApprovalType.JOB_COMPLETION,
        subjectType: 'Job',
        subjectId: bluepeakJobId,
        requestedByUserId: bluepeakOwner.id,
      },
      update: {},
    });
    northstarApprovalId = northstarApproval.id;
    bluepeakApprovalId = bluepeakApproval.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Northstar Owner cannot read a BluePeak job via own org URL', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const response = await agent.get(
      `/api/organizations/${northstarId}/jobs/${bluepeakJobId}`,
    );
    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('title');
  });

  it('Northstar Owner cannot read a BluePeak job via BluePeak org URL', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const response = await agent.get(
      `/api/organizations/${bluepeakId}/jobs/${bluepeakJobId}`,
    );
    expect(response.status).toBe(404);
  });

  it('Northstar Owner cannot update a BluePeak job', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const viaOwnOrg = await withCsrf(
      agent.patch(`/api/organizations/${northstarId}/jobs/${bluepeakJobId}`),
    ).send({ title: 'Hijacked job' });
    expect(viaOwnOrg.status).toBe(404);

    const viaForeignOrg = await withCsrf(
      agent.patch(`/api/organizations/${bluepeakId}/jobs/${bluepeakJobId}`),
    ).send({ title: 'Hijacked job' });
    expect(viaForeignOrg.status).toBe(404);

    const prisma = prismaFrom(app);
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: bluepeakJobId },
    });
    expect(job.title).not.toBe('Hijacked job');
  });

  it('Northstar Technician cannot read a BluePeak client', async () => {
    const { agent } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const viaOwnOrg = await agent.get(
      `/api/organizations/${northstarId}/clients/${bluepeakClientId}`,
    );
    expect(viaOwnOrg.status).toBe(404);

    const viaForeignOrg = await agent.get(
      `/api/organizations/${bluepeakId}/clients/${bluepeakClientId}`,
    );
    expect(viaForeignOrg.status).toBe(404);
  });

  it('Northstar Technician cannot access BluePeak file metadata', async () => {
    const { agent } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const viaOwnOrg = await agent.get(
      `/api/organizations/${northstarId}/files/${bluepeakFileId}`,
    );
    expect(viaOwnOrg.status).toBe(404);
    expect(viaOwnOrg.body).not.toHaveProperty('originalName');

    const viaForeignOrg = await agent.get(
      `/api/organizations/${bluepeakId}/files/${bluepeakFileId}`,
    );
    expect(viaForeignOrg.status).toBe(404);
  });

  it('Northstar Supervisor cannot approve BluePeak records', async () => {
    const { agent } = await loginAs(
      app,
      'riley.chen@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const viaOwnOrg = await withCsrf(
      agent.post(
        `/api/organizations/${northstarId}/approvals/${bluepeakApprovalId}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(viaOwnOrg.status).toBe(404);

    const viaForeignOrg = await withCsrf(
      agent.post(
        `/api/organizations/${bluepeakId}/approvals/${bluepeakApprovalId}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(viaForeignOrg.status).toBe(404);

    const prisma = prismaFrom(app);
    const approval = await prisma.approval.findUniqueOrThrow({
      where: { id: bluepeakApprovalId },
    });
    expect(approval.status).toBe('PENDING');
  });

  it('returns 403 when a technician tries an in-org approval', async () => {
    const { agent } = await loginAs(
      app,
      'sam.ortega@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const response = await withCsrf(
      agent.post(
        `/api/organizations/${northstarId}/approvals/${northstarApprovalId}/decide`,
      ),
    ).send({ decision: 'APPROVED' });
    expect(response.status).toBe(403);
  });

  it('returns 401 for an unauthenticated tenant request', async () => {
    const response = await api(app).get(
      `/api/organizations/${northstarId}/jobs/${northstarJobId}`,
    );
    expect(response.status).toBe(401);
  });

  it('allows a Northstar owner to read a Northstar job', async () => {
    const { agent } = await loginAs(
      app,
      'jordan.hale@northstar.fieldops.local',
      SEED_PASSWORD,
    );
    const response = await agent.get(
      `/api/organizations/${northstarId}/jobs/${northstarJobId}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(northstarJobId);
    expect(response.body.organizationId).toBe(northstarId);
  });
});
