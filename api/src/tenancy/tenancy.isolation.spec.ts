import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { createPrismaClient } from '../prisma/create-prisma-client.js';
import { withTenant } from './tenant-scope.js';

describe('tenant isolation', () => {
  const prisma = createPrismaClient();
  const suffix = randomUUID().slice(0, 8);

  let organizationAId = '';
  let organizationBId = '';
  let userAId = '';
  let userBId = '';
  let jobAId = '';
  let jobBId = '';
  let clientAId = '';
  let clientBId = '';

  beforeAll(async () => {
    await prisma.$connect();

    const passwordHash = 'testhash-not-for-login';

    const userA = await prisma.user.create({
      data: {
        email: `tenant-a-${suffix}@fieldops.test`,
        passwordHash,
        fullName: 'Tenant A Owner',
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: `tenant-b-${suffix}@fieldops.test`,
        passwordHash,
        fullName: 'Tenant B Owner',
      },
    });
    userAId = userA.id;
    userBId = userB.id;

    const orgA = await prisma.organization.create({
      data: {
        name: 'Tenant A Fixtures',
        slug: `tenant-a-${suffix}`,
        email: `ops-a-${suffix}@fieldops.test`,
        timezone: 'UTC',
        members: {
          create: { userId: userA.id, role: 'OWNER' },
        },
        settings: {
          create: { timezone: 'UTC', jobNumberPrefix: 'TA-' },
        },
        jobCounter: { create: { jobNext: 2 } },
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: 'Tenant B Fixtures',
        slug: `tenant-b-${suffix}`,
        email: `ops-b-${suffix}@fieldops.test`,
        timezone: 'UTC',
        members: {
          create: { userId: userB.id, role: 'OWNER' },
        },
        settings: {
          create: { timezone: 'UTC', jobNumberPrefix: 'TB-' },
        },
        jobCounter: { create: { jobNext: 2 } },
      },
    });
    organizationAId = orgA.id;
    organizationBId = orgB.id;

    const clientA = await prisma.client.create({
      data: {
        organizationId: orgA.id,
        name: 'Alpha Manufacturing',
        accountCode: `A-${suffix}`,
      },
    });
    const clientB = await prisma.client.create({
      data: {
        organizationId: orgB.id,
        name: 'Beta Properties',
        accountCode: `B-${suffix}`,
      },
    });
    clientAId = clientA.id;
    clientBId = clientB.id;

    const siteA = await prisma.site.create({
      data: {
        organizationId: orgA.id,
        clientId: clientA.id,
        name: 'Alpha Plant',
      },
    });
    const siteB = await prisma.site.create({
      data: {
        organizationId: orgB.id,
        clientId: clientB.id,
        name: 'Beta Tower',
      },
    });

    const jobA = await prisma.job.create({
      data: {
        organizationId: orgA.id,
        jobNumber: 'TA-1',
        title: 'Tenant A only job',
        clientId: clientA.id,
        siteId: siteA.id,
        jobType: 'SERVICE_CALL',
      },
    });
    const jobB = await prisma.job.create({
      data: {
        organizationId: orgB.id,
        jobNumber: 'TB-1',
        title: 'Tenant B only job',
        clientId: clientB.id,
        siteId: siteB.id,
        jobType: 'MAINTENANCE',
      },
    });
    jobAId = jobA.id;
    jobBId = jobB.id;
  });

  afterAll(async () => {
    const organizationIds = [organizationAId, organizationBId];
    await prisma.clockSession.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.jobAssignment.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.job.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.siteContact.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.site.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.client.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await prisma.organizationSettings.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await prisma.organizationCounter.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await prisma.$disconnect();
  });

  it('keeps jobs isolated when querying with organizationId', async () => {
    const tenantAJobs = await prisma.job.findMany({
      where: withTenant(organizationAId, {}),
    });
    const tenantBJobs = await prisma.job.findMany({
      where: withTenant(organizationBId, {}),
    });

    expect(tenantAJobs.map((job) => job.id)).toEqual([jobAId]);
    expect(tenantBJobs.map((job) => job.id)).toEqual([jobBId]);
    expect(tenantAJobs[0]?.title).not.toBe(tenantBJobs[0]?.title);
  });

  it('does not return another tenant job when looking up by id and organizationId', async () => {
    const leaked = await prisma.job.findFirst({
      where: withTenant(organizationAId, { id: jobBId }),
    });
    expect(leaked).toBeNull();
  });

  it('rejects attaching a site to a client from another organization', async () => {
    await expect(
      prisma.site.create({
        data: {
          organizationId: organizationAId,
          clientId: clientBId,
          name: 'Cross-tenant site',
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('allows only one OPEN clock session per technician', async () => {
    await prisma.clockSession.create({
      data: {
        organizationId: organizationAId,
        technicianUserId: userAId,
        jobId: jobAId,
        clockInAt: new Date(),
        status: 'OPEN',
      },
    });

    await expect(
      prisma.clockSession.create({
        data: {
          organizationId: organizationAId,
          technicianUserId: userAId,
          jobId: jobAId,
          clockInAt: new Date(),
          status: 'OPEN',
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('allows the same job number in different organizations', async () => {
    const extraA = await prisma.job.create({
      data: {
        organizationId: organizationAId,
        jobNumber: 'SHARED-1',
        title: 'Shared number in A',
        clientId: clientAId,
        siteId: (
          await prisma.site.findFirstOrThrow({
            where: { organizationId: organizationAId },
          })
        ).id,
        jobType: 'INSPECTION',
      },
    });
    const extraB = await prisma.job.create({
      data: {
        organizationId: organizationBId,
        jobNumber: 'SHARED-1',
        title: 'Shared number in B',
        clientId: clientBId,
        siteId: (
          await prisma.site.findFirstOrThrow({
            where: { organizationId: organizationBId },
          })
        ).id,
        jobType: 'INSPECTION',
      },
    });

    expect(extraA.jobNumber).toBe(extraB.jobNumber);
    expect(extraA.organizationId).not.toBe(extraB.organizationId);
  });
});
