import { hash } from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  NOTIFICATION_JOB_ASSIGNED,
  NOTIFICATION_TIMESHEET_SUBMITTED,
} from '../src/common/constants.js';
import {
  JobPriority,
  MembershipStatus,
  NotificationStatus,
  OrganizationRole,
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

describe('Notifications (e2e)', () => {
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
      email: `owner-${suffix}@notif.fieldops.test`,
      password: SEED_PASSWORD,
      fullName: `Notif Owner ${label}`,
      organizationName: `Notif Co ${suffix}`,
      timezone: 'America/Chicago',
      acceptTerms: true,
    });
    expect(signup.status).toBe(201);
    return {
      agent,
      organizationId: signup.body.organization.id as string,
      orgSlug: signup.body.organization.slug as string,
      ownerId: signup.body.user.id as string,
    };
  }

  async function addMember(
    organizationId: string,
    label: string,
    role: OrganizationRole,
  ) {
    const email = `${role.toLowerCase()}-${label}-${Date.now()}@notif.fieldops.test`;
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

  it('isolates inbox by tenant and recipient, supports read + mark-all', async () => {
    const a = await signupOrg('a');
    const b = await signupOrg('b');
    const tech = await addMember(
      a.organizationId,
      'a',
      OrganizationRole.TECHNICIAN,
    );

    await prismaFrom(app).notification.createMany({
      data: [
        {
          organizationId: a.organizationId,
          userId: tech.user.id,
          type: NOTIFICATION_JOB_ASSIGNED,
          title: 'Job assigned',
          body: 'For tech in org A',
          relatedEntityType: 'Job',
          relatedEntityId: '00000000-0000-4000-8000-000000000001',
        },
        {
          organizationId: a.organizationId,
          userId: a.ownerId,
          type: NOTIFICATION_TIMESHEET_SUBMITTED,
          title: 'Timesheet submitted',
          body: 'Owner copy',
        },
        {
          organizationId: b.organizationId,
          userId: tech.user.id,
          type: NOTIFICATION_JOB_ASSIGNED,
          title: 'Should not appear',
          body: 'Wrong tenant membership missing — still isolated by org filter',
        },
      ],
    });

    const { agent: techAgent } = await loginAs(app, tech.email, SEED_PASSWORD);
    const list = await techAgent.get(
      `/api/organizations/${a.organizationId}/notifications`,
    );
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].message).toBe('For tech in org A');

    const foreign = await techAgent.get(
      `/api/organizations/${b.organizationId}/notifications`,
    );
    expect(foreign.status).toBe(404);

    const unread = await techAgent.get(
      `/api/organizations/${a.organizationId}/notifications/unread-count`,
    );
    expect(unread.body.count).toBe(1);

    const ownerList = await a.agent.get(
      `/api/organizations/${a.organizationId}/notifications`,
    );
    expect(ownerList.body.items).toHaveLength(1);
    expect(ownerList.body.items[0].title).toBe('Timesheet submitted');

    const marked = await withCsrf(
      techAgent.patch(
        `/api/organizations/${a.organizationId}/notifications/${list.body.items[0].id}/read`,
      ),
    ).send({});
    expect(marked.status).toBe(200);
    expect(marked.body.status).toBe(NotificationStatus.READ);

    const ownerForeignRead = await withCsrf(
      a.agent.patch(
        `/api/organizations/${a.organizationId}/notifications/${list.body.items[0].id}/read`,
      ),
    ).send({});
    expect(ownerForeignRead.status).toBe(404);

    await prismaFrom(app).notification.create({
      data: {
        organizationId: a.organizationId,
        userId: tech.user.id,
        type: NOTIFICATION_JOB_ASSIGNED,
        title: 'Second',
        body: 'Another',
      },
    });
    const all = await withCsrf(
      techAgent.patch(
        `/api/organizations/${a.organizationId}/notifications/read-all`,
      ),
    ).send({});
    expect(all.status).toBe(200);
    expect(all.body.updated).toBeGreaterThanOrEqual(1);
    const after = await techAgent.get(
      `/api/organizations/${a.organizationId}/notifications/unread-count`,
    );
    expect(after.body.count).toBe(0);
  });

  it('creates assignment notification without failing when mail is down, and dedupes unread', async () => {
    const { agent, organizationId, ownerId } = await signupOrg('assign');
    const tech = await addMember(
      organizationId,
      'assign',
      OrganizationRole.TECHNICIAN,
    );
    await prismaFrom(app).organizationSettings.update({
      where: { organizationId },
      data: { requireGps: false, requireClientSignature: false },
    });
    const client = await prismaFrom(app).client.create({
      data: { organizationId, name: 'Notif Client' },
    });
    const site = await prismaFrom(app).site.create({
      data: {
        organizationId,
        clientId: client.id,
        name: 'Notif Site',
        city: 'Chicago',
        country: 'US',
      },
    });
    const created = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs`),
    ).send({
      title: 'Notify job',
      clientId: client.id,
      siteId: site.id,
      jobType: 'SERVICE_CALL',
      priority: JobPriority.NORMAL,
      technicianUserIds: [],
      scheduledStart: new Date().toISOString(),
      expectedFinish: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(created.status).toBe(201);

    const scheduled = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/schedule`),
    ).send({
      scheduledStart: created.body.scheduledStart,
      expectedFinish: created.body.expectedFinish,
      technicianUserIds: [tech.user.id],
      confirmOverlap: true,
    });
    expect(scheduled.status).toBe(200);

    const notices = await prismaFrom(app).notification.findMany({
      where: {
        organizationId,
        userId: tech.user.id,
        type: NOTIFICATION_JOB_ASSIGNED,
      },
    });
    expect(notices.length).toBe(1);
    expect(notices[0].relatedEntityId).toBe(created.body.id);

    const again = await withCsrf(
      agent.post(`/api/organizations/${organizationId}/jobs/${created.body.id}/schedule`),
    ).send({
      scheduledStart: created.body.scheduledStart,
      expectedFinish: created.body.expectedFinish,
      technicianUserIds: [tech.user.id],
      confirmOverlap: true,
    });
    expect(again.status).toBe(200);
    const afterDedupe = await prismaFrom(app).notification.count({
      where: {
        organizationId,
        userId: tech.user.id,
        type: NOTIFICATION_JOB_ASSIGNED,
        relatedEntityId: created.body.id,
        status: NotificationStatus.UNREAD,
      },
    });
    expect(afterDedupe).toBe(1);

    const ownerNotices = await prismaFrom(app).notification.count({
      where: {
        organizationId,
        userId: ownerId,
        type: NOTIFICATION_JOB_ASSIGNED,
      },
    });
    expect(ownerNotices).toBe(0);
  });
});
