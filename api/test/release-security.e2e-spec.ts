import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import {
  ApprovalType,
  JobStatus,
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

/**
 * Release-blocking security suite: cross-tenant IDOR matrix, auth session
 * revocation, workflow bypass, role escalation, and platform denial.
 */
describe('Release security audit (e2e)', () => {
  let app: INestApplication<App>;
  let northstarId = '';
  let bluepeakId = '';
  let northstarJobId = '';
  let bluepeakJobId = '';
  let bluepeakClientId = '';
  let bluepeakSiteId = '';
  let bluepeakTeamId = '';
  let bluepeakFileId = '';
  let bluepeakMemberId = '';
  let bluepeakInvitationId = '';
  let bluepeakTimesheetId = '';
  let bluepeakClockId = '';
  let bluepeakOvertimeId = '';
  let bluepeakApprovalId = '';

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

    bluepeakClientId = (
      await prisma.client.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;
    bluepeakSiteId = (
      await prisma.site.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;
    bluepeakTeamId = (
      await prisma.team.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;
    bluepeakFileId = (
      await prisma.jobFile.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;
    bluepeakMemberId = (
      await prisma.organizationMember.findFirstOrThrow({
        where: { organizationId: bluepeakId },
      })
    ).id;

    const invitation = await prisma.organizationInvitation.findFirst({
      where: { organizationId: bluepeakId },
    });
    if (invitation) {
      bluepeakInvitationId = invitation.id;
    }

    const timesheet = await prisma.timeEntry.findFirst({
      where: { organizationId: bluepeakId },
    });
    if (timesheet) {
      bluepeakTimesheetId = timesheet.id;
    }

    const clock = await prisma.clockSession.findFirst({
      where: { organizationId: bluepeakId },
    });
    if (clock) {
      bluepeakClockId = clock.id;
    }

    const overtime = await prisma.overtimeAuthorization.findFirst({
      where: { organizationId: bluepeakId },
    });
    if (overtime) {
      bluepeakOvertimeId = overtime.id;
    }

    const bluepeakOwner = await prisma.user.findUniqueOrThrow({
      where: { email: 'dana.brooks@bluepeak.fieldops.local' },
    });
    const existingApproval = await prisma.approval.findUnique({
      where: {
        organizationId_type_subjectId: {
          organizationId: bluepeakId,
          type: ApprovalType.JOB_COMPLETION,
          subjectId: bluepeakJobId,
        },
      },
    });
    if (existingApproval) {
      bluepeakApprovalId = existingApproval.id;
    } else {
      const approval = await prisma.approval.create({
        data: {
          organizationId: bluepeakId,
          type: ApprovalType.JOB_COMPLETION,
          subjectType: 'Job',
          subjectId: bluepeakJobId,
          requestedByUserId: bluepeakOwner.id,
        },
      });
      bluepeakApprovalId = approval.id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function northstarOwner() {
    return loginAs(app, 'jordan.hale@northstar.fieldops.local', SEED_PASSWORD);
  }

  async function northstarTech() {
    return loginAs(app, 'sam.ortega@northstar.fieldops.local', SEED_PASSWORD);
  }

  describe('tenant isolation (Organization A vs B)', () => {
    async function expectCrossTenant404(
      method: 'get' | 'patch' | 'post' | 'delete',
      pathOwn: string,
      pathForeign: string,
      body?: Record<string, unknown>,
    ) {
      const { agent } = await northstarOwner();
      const ownReq =
        method === 'get'
          ? agent.get(pathOwn)
          : method === 'delete'
            ? withCsrf(agent.delete(pathOwn))
            : withCsrf(agent[method](pathOwn));
      const own = body ? await ownReq.send(body) : await ownReq;
      expect(own.status).toBe(404);

      const foreignReq =
        method === 'get'
          ? agent.get(pathForeign)
          : method === 'delete'
            ? withCsrf(agent.delete(pathForeign))
            : withCsrf(agent[method](pathForeign));
      const foreign = body ? await foreignReq.send(body) : await foreignReq;
      expect(foreign.status).toBe(404);
    }

    it('blocks cross-tenant job/client/site/team/file/approval reads', async () => {
      await expectCrossTenant404(
        'get',
        `/api/organizations/${northstarId}/jobs/${bluepeakJobId}`,
        `/api/organizations/${bluepeakId}/jobs/${bluepeakJobId}`,
      );
      await expectCrossTenant404(
        'get',
        `/api/organizations/${northstarId}/clients/${bluepeakClientId}`,
        `/api/organizations/${bluepeakId}/clients/${bluepeakClientId}`,
      );
      await expectCrossTenant404(
        'get',
        `/api/organizations/${northstarId}/sites/${bluepeakSiteId}`,
        `/api/organizations/${bluepeakId}/sites/${bluepeakSiteId}`,
      );
      await expectCrossTenant404(
        'get',
        `/api/organizations/${northstarId}/teams/${bluepeakTeamId}`,
        `/api/organizations/${bluepeakId}/teams/${bluepeakTeamId}`,
      );
      await expectCrossTenant404(
        'get',
        `/api/organizations/${northstarId}/files/${bluepeakFileId}`,
        `/api/organizations/${bluepeakId}/files/${bluepeakFileId}`,
      );
      await expectCrossTenant404(
        'get',
        `/api/organizations/${northstarId}/approvals/${bluepeakApprovalId}`,
        `/api/organizations/${bluepeakId}/approvals/${bluepeakApprovalId}`,
      );
      await expectCrossTenant404(
        'get',
        `/api/organizations/${northstarId}/reports/jobs/${bluepeakJobId}/pdf`,
        `/api/organizations/${bluepeakId}/reports/jobs/${bluepeakJobId}/pdf`,
      );
    });

    it('blocks cross-tenant mutations on jobs, clients, teams, approvals', async () => {
      await expectCrossTenant404(
        'patch',
        `/api/organizations/${northstarId}/jobs/${bluepeakJobId}`,
        `/api/organizations/${bluepeakId}/jobs/${bluepeakJobId}`,
        { title: 'Cross-tenant hijack' },
      );
      await expectCrossTenant404(
        'patch',
        `/api/organizations/${northstarId}/clients/${bluepeakClientId}`,
        `/api/organizations/${bluepeakId}/clients/${bluepeakClientId}`,
        { name: 'Stolen client' },
      );
      await expectCrossTenant404(
        'patch',
        `/api/organizations/${northstarId}/teams/${bluepeakTeamId}`,
        `/api/organizations/${bluepeakId}/teams/${bluepeakTeamId}`,
        { name: 'Stolen team' },
      );
      await expectCrossTenant404(
        'post',
        `/api/organizations/${northstarId}/approvals/${bluepeakApprovalId}/decide`,
        `/api/organizations/${bluepeakId}/approvals/${bluepeakApprovalId}/decide`,
        { decision: 'APPROVED' },
      );
      await expectCrossTenant404(
        'post',
        `/api/organizations/${northstarId}/jobs/${bluepeakJobId}/complete`,
        `/api/organizations/${bluepeakId}/jobs/${bluepeakJobId}/complete`,
      );
    });

    it('blocks cross-tenant timesheet, clock, overtime, invitation when seeded', async () => {
      if (bluepeakTimesheetId) {
        await expectCrossTenant404(
          'get',
          `/api/organizations/${northstarId}/timesheets/entries/${bluepeakTimesheetId}`,
          `/api/organizations/${bluepeakId}/timesheets/entries/${bluepeakTimesheetId}`,
        );
      }

      if (bluepeakClockId) {
        await expectCrossTenant404(
          'get',
          `/api/organizations/${northstarId}/clock-sessions/${bluepeakClockId}`,
          `/api/organizations/${bluepeakId}/clock-sessions/${bluepeakClockId}`,
        );
      }

      if (bluepeakOvertimeId) {
        await expectCrossTenant404(
          'get',
          `/api/organizations/${northstarId}/overtime/${bluepeakOvertimeId}`,
          `/api/organizations/${bluepeakId}/overtime/${bluepeakOvertimeId}`,
        );
      }

      if (bluepeakInvitationId) {
        await expectCrossTenant404(
          'post',
          `/api/organizations/${northstarId}/invitations/${bluepeakInvitationId}/revoke`,
          `/api/organizations/${bluepeakId}/invitations/${bluepeakInvitationId}/revoke`,
        );
      }
    });

    it('blocks cross-tenant notification, settings, usage, and subscription', async () => {
      const { agent } = await northstarOwner();

      const settings = await withCsrf(
        agent.patch(`/api/organizations/${bluepeakId}/settings`),
      ).send({ requireGps: true });
      expect(settings.status).toBe(404);

      const notifications = await agent.get(
        `/api/organizations/${bluepeakId}/notifications`,
      );
      expect(notifications.status).toBe(404);

      const usage = await agent.get(`/api/organizations/${bluepeakId}/usage`);
      expect(usage.status).toBe(404);

      const subscription = await agent.get(
        `/api/organizations/${bluepeakId}/subscription`,
      );
      expect(subscription.status).toBe(404);
    });

    it('blocks BluePeak member id updates under Northstar URL', async () => {
      await expectCrossTenant404(
        'patch',
        `/api/organizations/${northstarId}/members/${bluepeakMemberId}`,
        `/api/organizations/${bluepeakId}/members/${bluepeakMemberId}`,
        { role: OrganizationRole.TECHNICIAN },
      );
    });

    it('keeps Northstar member list scoped to Northstar only', async () => {
      const { agent } = await northstarOwner();
      const listed = await agent.get(
        `/api/organizations/${northstarId}/members`,
      );
      expect(listed.status).toBe(200);
      expect(
        (listed.body as Array<{ organizationId: string }>).every(
          (m) => m.organizationId === northstarId,
        ),
      ).toBe(true);
    });
  });

  describe('authentication', () => {
    it('revokes refresh session on logout even when only access cookie is used', async () => {
      const { agent, response } = await loginAs(
        app,
        'dana.brooks@bluepeak.fieldops.local',
        SEED_PASSWORD,
      );
      expect(response.status).toBe(200);

      const me = await agent.get('/api/auth/me');
      expect(me.status).toBe(200);

      const prisma = prismaFrom(app);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'dana.brooks@bluepeak.fieldops.local' },
      });
      const before = await prisma.refreshSession.findFirstOrThrow({
        where: { userId: user.id, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      const logout = await withCsrf(agent.post('/api/auth/logout'));
      expect(logout.status).toBe(204);

      const after = await prisma.refreshSession.findUniqueOrThrow({
        where: { id: before.id },
      });
      expect(after.revokedAt).not.toBeNull();

      const meAfter = await agent.get('/api/auth/me');
      expect(meAfter.status).toBe(401);
    });

    it('never returns passwordHash or JWT material in auth responses', async () => {
      const { response } = await loginAs(
        app,
        'jordan.hale@northstar.fieldops.local',
        SEED_PASSWORD,
      );
      expect(response.status).toBe(200);
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    });
  });

  describe('authorization and workflow', () => {
    it('rejects direct status mutation through PATCH job', async () => {
      const { agent } = await northstarOwner();
      const response = await withCsrf(
        agent.patch(
          `/api/organizations/${northstarId}/jobs/${northstarJobId}`,
        ),
      ).send({ status: JobStatus.COMPLETED, title: 'Should fail validation' });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toMatch(/status|whitelist|property/i);
    });

    it('denies technicians from member role escalation and platform APIs', async () => {
      const { agent } = await northstarTech();
      const prisma = prismaFrom(app);
      const techMembership = await prisma.organizationMember.findFirstOrThrow({
        where: {
          organizationId: northstarId,
          user: { email: 'sam.ortega@northstar.fieldops.local' },
        },
      });

      const escalate = await withCsrf(
        agent.patch(
          `/api/organizations/${northstarId}/members/${techMembership.id}`,
        ),
      ).send({ role: OrganizationRole.OWNER });
      expect(escalate.status).toBe(403);

      const platform = await agent.get('/api/platform/dashboard');
      expect(platform.status).toBe(403);

      const activate = await withCsrf(
        agent.post(
          `/api/platform/organizations/${northstarId}/subscription/activate`,
        ),
      ).send({ planCode: 'professional' });
      expect(activate.status).toBe(403);
    });

    it('rejects concurrent second approve after first completes', async () => {
      const prisma = prismaFrom(app);
      const tech = await prisma.user.findUniqueOrThrow({
        where: { email: 'sam.ortega@northstar.fieldops.local' },
      });
      const client = await prisma.client.findFirstOrThrow({
        where: { organizationId: northstarId },
      });
      const site = await prisma.site.findFirstOrThrow({
        where: { organizationId: northstarId, clientId: client.id },
      });

      const previousSettings = await prisma.organizationSettings.findUniqueOrThrow({
        where: { organizationId: northstarId },
      });
      await prisma.organizationSettings.update({
        where: { organizationId: northstarId },
        data: {
          requireClientSignature: false,
          requireGps: false,
        },
      });

      const job = await prisma.job.create({
        data: {
          organizationId: northstarId,
          clientId: client.id,
          siteId: site.id,
          jobNumber: `SEC-${Date.now()}`,
          title: 'Approve race job',
          status: JobStatus.PENDING_APPROVAL,
          jobType: 'SERVICE',
          requireClientSignOff: false,
        },
      });
      await prisma.jobAssignment.create({
        data: {
          organizationId: northstarId,
          jobId: job.id,
          userId: tech.id,
          role: 'TECHNICIAN',
        },
      });
      await prisma.approval.upsert({
        where: {
          organizationId_type_subjectId: {
            organizationId: northstarId,
            type: ApprovalType.JOB_COMPLETION,
            subjectId: job.id,
          },
        },
        create: {
          organizationId: northstarId,
          type: ApprovalType.JOB_COMPLETION,
          subjectType: 'Job',
          subjectId: job.id,
          requestedByUserId: tech.id,
        },
        update: {
          status: 'PENDING',
          decidedAt: null,
          decidedByUserId: null,
          decision: null,
          comment: null,
        },
      });

      try {
        const { agent } = await northstarOwner();
        const first = await withCsrf(
          agent.post(
            `/api/organizations/${northstarId}/jobs/${job.id}/complete`,
          ),
        ).send({});
        expect(first.status).toBe(200);
        expect(first.body.status).toBe(JobStatus.COMPLETED);

        const second = await withCsrf(
          agent.post(
            `/api/organizations/${northstarId}/jobs/${job.id}/complete`,
          ),
        ).send({});
        expect([400, 409]).toContain(second.status);
      } finally {
        await prisma.approval.deleteMany({ where: { subjectId: job.id } });
        await prisma.jobAssignment.deleteMany({ where: { jobId: job.id } });
        await prisma.job.delete({ where: { id: job.id } });
        await prisma.organizationSettings.update({
          where: { organizationId: northstarId },
          data: {
            requireClientSignature: previousSettings.requireClientSignature,
            requireGps: previousSettings.requireGps,
          },
        });
      }
    });
  });
});
