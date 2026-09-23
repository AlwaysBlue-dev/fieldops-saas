import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUDIT_TEAM_MEMBER_ADDED, INVITATION_TTL_DAYS, NOTIFICATION_INVITATION } from '../common/constants.js';
import { generateUrlToken, hashToken } from '../common/crypto-token.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { hashPassword, normalizeEmail } from '../auth/password.js';
import { toPublicUser } from '../auth/user.serializer.js';
import {
  EntityStatus,
  InvitationStatus,
  MembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  UserStatus,
} from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import type { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { SubscriptionAccessService } from '../subscription/subscription-access.service.js';
import { MembersService } from './members.service.js';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    private readonly members: MembersService,
    private readonly access: SubscriptionAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(organizationId: string) {
    const invitations = await this.prisma.organizationInvitation.findMany({
      where: { organizationId },
      include: { team: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((invite) => this.serialize(invite));
  }

  async create(
    ctx: OrganizationContext,
    dto: CreateInvitationDto,
    actorUserId: string,
  ) {
    const email = normalizeEmail(dto.email);
    await this.access.assertSeatAvailable(ctx.organizationId, true, actorUserId);
    await this.members.ensureNotAlreadyMember(ctx.organizationId, email);
    if (dto.role === OrganizationRole.OWNER) {
      // Allowed: another owner can be invited. Last-owner rule is on removal.
    }

    const pending = await this.prisma.organizationInvitation.findFirst({
      where: {
        organizationId: ctx.organizationId,
        email,
        status: InvitationStatus.PENDING,
      },
    });
    if (pending) {
      throw new ConflictException('A pending invitation already exists for that email');
    }

    let teamId: string | null = null;
    if (dto.teamId) {
      if (dto.role !== OrganizationRole.TECHNICIAN) {
        throw new BadRequestException(
          'A team can only be selected when inviting a technician',
        );
      }
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, organizationId: ctx.organizationId },
      });
      if (!team) {
        throw new NotFoundException();
      }
      if (team.status !== EntityStatus.ACTIVE) {
        throw new BadRequestException('Cannot assign an invite to an inactive team');
      }
      teamId = team.id;
    }

    const rawToken = generateUrlToken();
    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId: ctx.organizationId,
        email,
        role: dto.role,
        teamId,
        tokenHash: hashToken(rawToken),
        invitedById: actorUserId,
        expiresAt: this.expiresAt(),
      },
      include: { team: { select: { id: true, name: true, status: true } } },
    });

    await this.audit.record({
      action: 'organization.invitation_created',
      entityType: 'OrganizationInvitation',
      entityId: invitation.id,
      organizationId: ctx.organizationId,
      actorUserId,
      metadata: { email, role: dto.role, teamId },
    });

    await this.mail.sendOrganizationInvitation({
      to: email,
      organizationName: ctx.name,
      role: dto.role,
      rawToken,
    });

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      await this.notifications.notify({
        organizationId: ctx.organizationId,
        recipientUserIds: [existingUser.id],
        type: NOTIFICATION_INVITATION,
        title: 'Organization invitation',
        message: `You were invited to join ${ctx.name} as ${dto.role.replaceAll('_', ' ').toLowerCase()}.`,
        relatedEntityType: 'OrganizationInvitation',
        relatedEntityId: invitation.id,
        payload: { organizationSlug: ctx.slug, role: dto.role },
        dedupeUnread: true,
      });
    }

    return this.serialize(invitation);
  }

  async resend(
    ctx: OrganizationContext,
    invitationId: string,
    actorUserId: string,
  ) {
    const invitation = await this.requirePending(ctx.organizationId, invitationId);
    const rawToken = generateUrlToken();

    const updated = await this.prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash: hashToken(rawToken),
        expiresAt: this.expiresAt(),
      },
    });

    await this.audit.record({
      action: 'organization.invitation_resent',
      entityType: 'OrganizationInvitation',
      entityId: updated.id,
      organizationId: ctx.organizationId,
      actorUserId,
      metadata: { email: updated.email },
    });

    await this.mail.sendOrganizationInvitation({
      to: updated.email,
      organizationName: ctx.name,
      role: updated.role,
      rawToken,
    });

    return this.serialize(updated);
  }

  async revoke(
    ctx: OrganizationContext,
    invitationId: string,
    actorUserId: string,
  ) {
    const invitation = await this.requirePending(ctx.organizationId, invitationId);
    const updated = await this.prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED },
    });

    await this.audit.record({
      action: 'organization.invitation_revoked',
      entityType: 'OrganizationInvitation',
      entityId: updated.id,
      organizationId: ctx.organizationId,
      actorUserId,
      metadata: { email: updated.email },
    });

    return this.serialize(updated);
  }

  async preview(rawToken: string) {
    const invitation = await this.findByToken(rawToken);
    return {
      organizationName: invitation.organization.name,
      role: invitation.role,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    };
  }

  async accept(
    rawToken: string,
    dto: AcceptInvitationDto,
    request: Request,
    currentUser?: AuthUser,
  ) {
    const invitation = await this.findByToken(rawToken);
    const email = invitation.email;

    let user = currentUser
      ? await this.prisma.user.findUnique({ where: { id: currentUser.id } })
      : await this.prisma.user.findUnique({ where: { email } });

    if (currentUser && currentUser.email !== email) {
      throw new ForbiddenException('This invitation was issued to a different email');
    }

    if (!currentUser && user) {
      throw new UnauthorizedException('Sign in to accept this invitation');
    }

    if (!user) {
      if (!dto.fullName?.trim() || !dto.password) {
        throw new BadRequestException('Full name and password are required to join');
      }
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: dto.fullName.trim(),
          passwordHash: await hashPassword(dto.password),
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });
    }

    const existingMembership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
    });
    if (!existingMembership || existingMembership.status !== MembershipStatus.ACTIVE) {
      await this.access.assertSeatAvailable(
        invitation.organizationId,
        false,
        user.id,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
      });

      const membership = existing
        ? await tx.organizationMember.update({
            where: { id: existing.id },
            data: {
              role: invitation.role,
              status: MembershipStatus.ACTIVE,
            },
          })
        : await tx.organizationMember.create({
            data: {
              organizationId: invitation.organizationId,
              userId: user.id,
              role: invitation.role,
            },
          });

      if (invitation.teamId) {
        const team = await tx.team.findFirst({
          where: {
            id: invitation.teamId,
            organizationId: invitation.organizationId,
            status: EntityStatus.ACTIVE,
          },
        });
        if (team) {
          await tx.teamMember.upsert({
            where: {
              teamId_userId: { teamId: team.id, userId: user.id },
            },
            create: {
              organizationId: invitation.organizationId,
              teamId: team.id,
              userId: user.id,
            },
            update: {},
          });
          await this.audit.record(
            {
              action: AUDIT_TEAM_MEMBER_ADDED,
              entityType: 'TeamMember',
              entityId: team.id,
              organizationId: invitation.organizationId,
              actorUserId: user.id,
              newValues: { teamId: team.id, userId: user.id, viaInvitation: true },
            },
            tx,
          );
        }
      }

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      await this.audit.record(
        {
          action: 'organization.invitation_accepted',
          entityType: 'OrganizationInvitation',
          entityId: invitation.id,
          organizationId: invitation.organizationId,
          actorUserId: user.id,
          metadata: { role: invitation.role, email },
        },
        tx,
      );

      return membership;
    });

    const tokens = await this.auth.issueSession(user.id, request);
    return {
      user: toPublicUser(user),
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
        slug: invitation.organization.slug,
      },
      membership: {
        id: result.id,
        role: result.role,
      },
      ...tokens,
    };
  }

  private async requirePending(organizationId: string, invitationId: string) {
    const invitation = await this.prisma.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!invitation) {
      throw new NotFoundException();
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException('Invitation is no longer pending');
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new GoneException('Invitation has expired');
    }
    return invitation;
  }

  private async findByToken(rawToken: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { organization: true },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.organization.status !== OrganizationStatus.ACTIVE) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status === InvitationStatus.REVOKED) {
      throw new GoneException('Invitation has been revoked');
    }
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictException('Invitation has already been accepted');
    }
    if (invitation.expiresAt <= new Date() || invitation.status === InvitationStatus.EXPIRED) {
      if (invitation.status === InvitationStatus.PENDING) {
        await this.prisma.organizationInvitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED },
        });
      }
      throw new GoneException('Invitation has expired');
    }
    return invitation;
  }

  private expiresAt() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + INVITATION_TTL_DAYS);
    return date;
  }

  private serialize(invitation: {
    id: string;
    organizationId: string;
    email: string;
    role: OrganizationRole;
    teamId?: string | null;
    expiresAt: Date;
    acceptedAt: Date | null;
    status: InvitationStatus;
    createdAt: Date;
    team?: { id: string; name: string; status: EntityStatus } | null;
  }) {
    return {
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      teamId: invitation.teamId ?? null,
      team: invitation.team
        ? {
            id: invitation.team.id,
            name: invitation.team.name,
            status: invitation.team.status,
          }
        : null,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      status: invitation.status,
      createdAt: invitation.createdAt,
    };
  }
}
