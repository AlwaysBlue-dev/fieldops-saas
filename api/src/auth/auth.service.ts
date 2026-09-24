import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  AUDIT_ORGANIZATION_CREATED_WITHOUT_TRIAL,
  AUDIT_TRIAL_STARTED,
  AUDIT_USER_FIRST_TRIAL_CONSUMED,
  DEFAULT_PLAN_CODE,
  EMAIL_VERIFICATION_TTL_HOURS,
  PASSWORD_RESET_TTL_MINUTES,
  TRIAL_DAYS,
  TRIAL_GRACE_DAYS,
  TRIAL_PLAN_CODE,
} from '../common/constants.js';
import { trialWindow } from '../subscription/clock.js';
import { generateUrlToken, hashToken, tokenMatches } from '../common/crypto-token.js';
import { durationToMs } from '../common/duration.js';
import { slugifyName } from '../common/slug.js';
import type { EnvironmentVariables } from '../config/env.js';
import {
  OrganizationRole,
  PlanStatus,
  Prisma,
  MembershipStatus,
  SubscriptionStatus,
  UserStatus,
} from '../generated/prisma/client.js';
import {
  organizationNamesMatch,
  validateOrganizationDisplayName,
} from '../common/organization-name.js';
import { AuditService } from '../audit/audit.service.js';
import { LegalService } from '../legal/legal.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SignupDto } from './dto/signup.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import type { AccessTokenPayload, RefreshTokenPayload } from './jwt-payload.js';
import { hashPassword, normalizeEmail, verifyPassword } from './password.js';
import { toPublicUser } from './user.serializer.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/constants.js';

const PASSWORD_RESET_PUBLIC_MESSAGE =
  'If an account exists for this email, we’ve sent password reset instructions.';

const PASSWORD_RESET_TOKEN_ERROR =
  'This password reset link is invalid or has expired. Request a new one to continue.';

const EMAIL_VERIFICATION_TOKEN_ERROR =
  'This verification link is invalid or has expired. Request a new one below.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly legal: LegalService,
  ) {}

  async signup(dto: SignupDto, request: Request) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists. Sign in, or use a different email.',
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const rawVerificationToken = generateUrlToken();
    const verificationExpires = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
    );
    const requestMeta = this.requestMeta(request);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName: dto.fullName.trim(),
            status: UserStatus.ACTIVE,
            emailVerifiedAt: null,
            termsAcceptedAt: new Date(),
            termsVersion: this.legal.termsVersion(),
            privacyVersion: this.legal.privacyVersion(),
          },
        });

        await tx.emailVerificationToken.create({
          data: {
            userId: created.id,
            tokenHash: hashToken(rawVerificationToken),
            expiresAt: verificationExpires,
          },
        });

        await this.audit.record(
          {
            action: 'auth.signup',
            entityType: 'User',
            entityId: created.id,
            actorUserId: created.id,
            metadata: { email, emailVerified: false },
            ...requestMeta,
          },
          tx,
        );

        return created;
      });

      await this.mail.sendEmailVerification(email, rawVerificationToken);
      const tokens = await this.issueSession(user.id, request);
      return {
        user: toPublicUser(user),
        emailVerificationRequired: true,
        ...tokens,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
        'An account with this email already exists. Sign in, or use a different email.',
      );
      }
      throw error;
    }
  }

  async createWorkspace(userId: string, dto: CreateWorkspaceDto, request: Request) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Your email address has not been verified.',
        error: 'Forbidden',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const email = user.email;
    const timezone = dto.timezone ?? 'America/Chicago';
    const requestMeta = this.requestMeta(request);
    const now = new Date();

    try {
      const organization = await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent workspace creates for this account.
        const lockedRows = await tx.$queryRaw<
          Array<{ id: string; emailVerifiedAt: Date | null; trialUsedAt: Date | null }>
        >`
          SELECT id, "emailVerifiedAt", "trialUsedAt"
          FROM "User"
          WHERE id = ${userId}::uuid
          FOR UPDATE
        `;
        const lockedRow = lockedRows[0];
        if (!lockedRow) {
          throw new ForbiddenException('Account not found.');
        }
        if (!lockedRow.emailVerifiedAt) {
          throw new ForbiddenException({
            statusCode: 403,
            message: 'Your email address has not been verified.',
            error: 'Forbidden',
            code: 'EMAIL_NOT_VERIFIED',
          });
        }

        const nameValidation = validateOrganizationDisplayName(
          dto.organizationName,
        );
        if (!nameValidation.ok) {
          throw new BadRequestException(nameValidation.message);
        }
        const displayName = nameValidation.displayName;

        const ownedMemberships = await tx.organizationMember.findMany({
          where: {
            userId,
            role: OrganizationRole.OWNER,
            status: MembershipStatus.ACTIVE,
          },
          include: {
            organization: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        });
        const duplicateOwned = ownedMemberships.find((membership) =>
          organizationNamesMatch(membership.organization.name, displayName),
        );
        if (duplicateOwned) {
          throw new ConflictException({
            statusCode: 409,
            message: `You already have a workspace named “${duplicateOwned.organization.name}”.`,
            error: 'Conflict',
            code: 'WORKSPACE_NAME_TAKEN',
            existingOrganization: {
              id: duplicateOwned.organization.id,
              name: duplicateOwned.organization.name,
              slug: duplicateOwned.organization.slug,
            },
          });
        }

        const trialEligible = lockedRow.trialUsedAt == null;
        let planCode: string;
        let subscriptionStatus: typeof SubscriptionStatus.TRIALING | typeof SubscriptionStatus.NONE;
        let trialStartedAt: Date | null = null;
        let trialEndsAt: Date | null = null;
        let graceEndsAt: Date | null = null;

        if (trialEligible) {
          planCode = TRIAL_PLAN_CODE;
          subscriptionStatus = SubscriptionStatus.TRIALING;
          const window = trialWindow(now, TRIAL_DAYS, TRIAL_GRACE_DAYS);
          trialStartedAt = window.trialStartedAt;
          trialEndsAt = window.trialEndsAt;
          graceEndsAt = window.graceEndsAt;
        } else {
          planCode = dto.planCode?.trim().toLowerCase() || DEFAULT_PLAN_CODE;
          if (!['starter', 'professional', 'business'].includes(planCode)) {
            throw new BadRequestException(
              'Choose Starter, Professional, or Business for this workspace.',
            );
          }
          subscriptionStatus = SubscriptionStatus.NONE;
        }

        const plan = await tx.plan.findFirst({
          where: { code: planCode, status: PlanStatus.ACTIVE },
        });
        if (!plan) {
          throw new ServiceUnavailableException(
            trialEligible
              ? 'We can’t start a workspace trial right now. Please try again later.'
              : 'We can’t create that workspace plan right now. Please try again later.',
          );
        }

        const created = await tx.organization.create({
          data: {
            name: displayName,
            slug: await this.allocateSlug(tx, displayName),
            email,
            timezone,
          },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: created.id,
            userId: userId,
            role: OrganizationRole.OWNER,
          },
        });

        await tx.organizationSettings.create({
          data: {
            organizationId: created.id,
            timezone,
          },
        });

        await tx.organizationCounter.create({
          data: { organizationId: created.id, jobNext: 1 },
        });

        await tx.subscription.create({
          data: {
            organizationId: created.id,
            planId: plan.id,
            status: subscriptionStatus,
            trialStartedAt,
            trialEndsAt,
            graceEndsAt,
          },
        });

        await this.audit.record(
          {
            action: 'organization.created',
            entityType: 'Organization',
            entityId: created.id,
            actorUserId: userId,
            organizationId: created.id,
            metadata: {
              name: created.name,
              slug: created.slug,
              trialEligible,
              planCode,
            },
            ...requestMeta,
          },
          tx,
        );

        if (trialEligible) {
          await tx.$executeRaw`
            UPDATE "User" SET "trialUsedAt" = ${now}
            WHERE id = ${userId}::uuid
          `;
          await this.audit.record(
            {
              action: AUDIT_TRIAL_STARTED,
              entityType: 'Subscription',
              entityId: created.id,
              actorUserId: userId,
              organizationId: created.id,
              newValues: {
                status: SubscriptionStatus.TRIALING,
                planCode: TRIAL_PLAN_CODE,
                trialStartedAt: trialStartedAt!.toISOString(),
                trialEndsAt: trialEndsAt!.toISOString(),
                graceEndsAt: graceEndsAt!.toISOString(),
              },
              ...requestMeta,
            },
            tx,
          );
          await this.audit.record(
            {
              action: AUDIT_USER_FIRST_TRIAL_CONSUMED,
              entityType: 'User',
              entityId: userId,
              actorUserId: userId,
              organizationId: created.id,
              newValues: {
                trialUsedAt: now.toISOString(),
                organizationId: created.id,
                planCode: TRIAL_PLAN_CODE,
              },
              ...requestMeta,
            },
            tx,
          );
        } else {
          await this.audit.record(
            {
              action: AUDIT_ORGANIZATION_CREATED_WITHOUT_TRIAL,
              entityType: 'Organization',
              entityId: created.id,
              actorUserId: userId,
              organizationId: created.id,
              newValues: {
                planCode,
                status: SubscriptionStatus.NONE,
              },
              ...requestMeta,
            },
            tx,
          );
        }

        return {
          created,
          trialEligible,
          planCode,
        };
      });

      return {
        user: toPublicUser({
          ...user,
          trialUsedAt: organization.trialEligible
            ? now
            : (user as { trialUsedAt?: Date | null }).trialUsedAt ?? null,
        }),
        organization: {
          id: organization.created.id,
          name: organization.created.name,
          slug: organization.created.slug,
        },
        trialStarted: organization.trialEligible,
        planCode: organization.planCode,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'We couldn’t create your workspace. Please try again in a moment.',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto, request: Request) {
    const email = normalizeEmail(dto.email);
    const requestMeta = this.requestMeta(request);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordOk = user
      ? await verifyPassword(dto.password, user.passwordHash)
      : false;

    if (!user || !passwordOk) {
      await this.audit.record({
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user?.id ?? email,
        metadata: { email, reason: 'invalid_credentials' },
        ...requestMeta,
      });
      throw new UnauthorizedException(
        'That email or password doesn’t look right. Please try again.',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.audit.record({
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user.id,
        actorUserId: user.id,
        metadata: { email, reason: 'inactive' },
        ...requestMeta,
      });
      throw new ForbiddenException(
        'This account is inactive. Contact your organization admin for help.',
      );
    }

    const tokens = await this.issueSession(user.id, request);
    const emailVerificationRequired = !user.emailVerifiedAt;
    await this.audit.record({
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      metadata: { email, emailVerified: Boolean(user.emailVerifiedAt) },
      ...requestMeta,
    });

    return {
      user: toPublicUser(user),
      emailVerificationRequired,
      ...(emailVerificationRequired
        ? {
            message: 'Your email address has not been verified.',
          }
        : {}),
      ...tokens,
    };
  }

  async logout(request: Request, userId?: string) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    const accessToken = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    let actorId = userId;
    const revokedSids = new Set<string>();

    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
          refreshToken,
          {
            secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
          },
        );
        actorId = actorId ?? payload.sub;
        if (payload.sid) {
          await this.prisma.refreshSession.updateMany({
            where: {
              id: payload.sid,
              userId: payload.sub,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
          revokedSids.add(payload.sid);
        }
      } catch {
        // Cookie may already be invalid; still clear it.
      }
    }

    if (accessToken) {
      try {
        const payload = await this.jwt.verifyAsync<AccessTokenPayload>(
          accessToken,
          {
            secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
            ignoreExpiration: true,
          },
        );
        if (payload.typ === 'access' && payload.sid && payload.sub) {
          actorId = actorId ?? payload.sub;
          if (!revokedSids.has(payload.sid)) {
            await this.prisma.refreshSession.updateMany({
              where: {
                id: payload.sid,
                userId: payload.sub,
                revokedAt: null,
              },
              data: { revokedAt: new Date() },
            });
          }
        }
      } catch {
        // Access cookie may already be invalid; still clear it.
      }
    }

    if (actorId) {
      await this.audit.record({
        action: 'auth.logout',
        entityType: 'User',
        entityId: actorId,
        actorUserId: actorId,
        ...this.requestMeta(request),
      });
    }
  }

  async refresh(request: Request) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.typ !== 'refresh' || !payload.sid || !payload.sub) {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.refreshSession.findFirst({
      where: { id: payload.sid, userId: payload.sub },
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    if (session.revokedAt) {
      await this.prisma.refreshSession.updateMany({
        where: { userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }

    if (session.expiresAt <= new Date() || !tokenMatches(refreshToken, session.tokenHash)) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, status: UserStatus.ACTIVE },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    const revoked = await this.prisma.refreshSession.updateMany({
      where: {
        id: session.id,
        userId: payload.sub,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) {
      throw new UnauthorizedException();
    }

    const tokens = await this.issueSession(user.id, request);
    return { user: toPublicUser(user), ...tokens };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if ('trialUsedAt' in user) {
      return toPublicUser(user as typeof user & { trialUsedAt: Date | null });
    }
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ trialUsedAt: Date | null }>
      >`
        SELECT "trialUsedAt" FROM "User" WHERE id = ${userId}::uuid
      `;
      return toPublicUser({
        ...user,
        trialUsedAt: rows[0]?.trialUsedAt ?? null,
      });
    } catch {
      return toPublicUser({ ...user, trialUsedAt: null });
    }
  }

  async listOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      role: membership.role,
      joinedAt: membership.joinedAt,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        timezone: membership.organization.timezone,
        status: membership.organization.status,
        industry: membership.organization.industry,
        onboardingStep: membership.organization.onboardingStep,
        onboardingCompletedAt: membership.organization.onboardingCompletedAt,
        hasLogo: Boolean(
          membership.organization.logoObjectKey ||
            membership.organization.logoUrl,
        ),
      },
    }));
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) {
      throw new BadRequestException(EMAIL_VERIFICATION_TOKEN_ERROR);
    }

    const membershipCountFor = (userId: string) =>
      this.prisma.organizationMember.count({
        where: {
          userId,
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
        },
      });

    // Idempotent: link already used / email already confirmed.
    if (record.user.emailVerifiedAt) {
      return {
        verified: true,
        hasWorkspace: (await membershipCountFor(record.userId)) > 0,
        user: toPublicUser(record.user),
      };
    }

    if (record.consumedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException(EMAIL_VERIFICATION_TOKEN_ERROR);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: record.userId },
        });
        if (user.emailVerifiedAt) {
          const membershipCount = await tx.organizationMember.count({
            where: {
              userId: user.id,
              status: 'ACTIVE',
              organization: { status: 'ACTIVE' },
            },
          });
          return { user, hasWorkspace: membershipCount > 0 };
        }
        throw new BadRequestException(EMAIL_VERIFICATION_TOKEN_ERROR);
      }

      const user = await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });

      await tx.emailVerificationToken.updateMany({
        where: { userId: record.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      const membershipCount = await tx.organizationMember.count({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
        },
      });

      return { user, hasWorkspace: membershipCount > 0 };
    });

    return {
      verified: true,
      hasWorkspace: result.hasWorkspace,
      user: toPublicUser(result.user),
    };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) {
      return {
        message:
          'Your email is already verified. You can continue to your workspace.',
        alreadyVerified: true,
      };
    }

    const rawToken = generateUrlToken();
    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt,
        },
      });
      await this.audit.record(
        {
          action: 'auth.email_verification_resent',
          entityType: 'User',
          entityId: user.id,
          actorUserId: user.id,
          metadata: { email: user.email },
        },
        tx,
      );
    });

    await this.mail.sendEmailVerification(user.email, rawToken);
    return {
      message: 'We’ve sent a new verification link to your email.',
      alreadyVerified: false,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, request: Request) {
    const email = normalizeEmail(dto.email);
    const requestMeta = this.requestMeta(request);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.audit.record({
        action: 'auth.password_reset_requested',
        entityType: 'User',
        entityId: email,
        metadata: { outcome: 'accepted' },
        ...requestMeta,
      });
      return { message: PASSWORD_RESET_PUBLIC_MESSAGE };
    }

    const rawToken = generateUrlToken();
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt,
        },
      });
      await this.audit.record(
        {
          action: 'auth.password_reset_requested',
          entityType: 'User',
          entityId: user.id,
          actorUserId: user.id,
          metadata: { outcome: 'accepted' },
          ...requestMeta,
        },
        tx,
      );
    });

    await this.mail.sendPasswordReset(email, rawToken);

    return { message: PASSWORD_RESET_PUBLIC_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto, request: Request) {
    const tokenHash = hashToken(dto.token);
    const requestMeta = this.requestMeta(request);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.user.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException(PASSWORD_RESET_TOKEN_ERROR);
    }

    const passwordHash = await hashPassword(dto.password);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.audit.record(
        {
          action: 'auth.password_reset_completed',
          entityType: 'User',
          entityId: record.userId,
          actorUserId: record.userId,
          metadata: { sessionsRevoked: true },
          ...requestMeta,
        },
        tx,
      );
    });

    return {
      message: 'Password updated. You can sign in with your new password.',
    };
  }

  async issueSession(userId: string, request: Request) {
    const sessionId = randomUUID();
    const accessPayload: AccessTokenPayload = {
      sub: userId,
      sid: sessionId,
      typ: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      sid: sessionId,
      typ: 'refresh',
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }) as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true }) as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(
          Date.now() +
            durationToMs(this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true })),
        ),
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: this.clientIp(request),
      },
    });

    return { accessToken, refreshToken };
  }

  private async allocateSlug(
    tx: Prisma.TransactionClient,
    name: string,
  ): Promise<string> {
    const base = slugifyName(name);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate =
        attempt === 0
          ? base
          : attempt < 8
            ? `${base}-${attempt + 1}`
            : `${base}-${randomBytes(3).toString('hex')}`;
      const taken = await tx.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) {
        return candidate;
      }
    }
    return `${base}-${randomBytes(4).toString('hex')}`;
  }

  private requestMeta(request: Request) {
    return {
      ipAddress: this.clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    };
  }

  private clientIp(request: Request): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return request.ip ?? null;
  }
}
