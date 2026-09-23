import {
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
  AUDIT_TRIAL_STARTED,
  EMAIL_VERIFICATION_TTL_HOURS,
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
  SubscriptionStatus,
  UserStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SignupDto } from './dto/signup.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AccessTokenPayload, RefreshTokenPayload } from './jwt-payload.js';
import { hashPassword, normalizeEmail, verifyPassword } from './password.js';
import { toPublicUser } from './user.serializer.js';
import { REFRESH_COOKIE } from '../common/constants.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async signup(dto: SignupDto, request: Request) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const plan = await this.prisma.plan.findFirst({
      where: { code: TRIAL_PLAN_CODE, status: PlanStatus.ACTIVE },
    });
    if (!plan) {
      throw new ServiceUnavailableException('Trial plan is not configured');
    }

    const passwordHash = await hashPassword(dto.password);
    const timezone = dto.timezone ?? 'America/Chicago';
    const rawVerificationToken = generateUrlToken();
    const { trialStartedAt, trialEndsAt, graceEndsAt } = trialWindow(
      new Date(),
      TRIAL_DAYS,
      TRIAL_GRACE_DAYS,
    );
    const verificationExpires = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
    );
    const requestMeta = this.requestMeta(request);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            fullName: dto.fullName.trim(),
            status: UserStatus.ACTIVE,
          },
        });

        const organization = await tx.organization.create({
          data: {
            name: dto.organizationName.trim(),
            slug: await this.allocateSlug(tx, dto.organizationName),
            email,
            timezone,
          },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: OrganizationRole.OWNER,
          },
        });

        await tx.organizationSettings.create({
          data: {
            organizationId: organization.id,
            timezone,
          },
        });

        await tx.organizationCounter.create({
          data: { organizationId: organization.id, jobNext: 1 },
        });

        await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: plan.id,
            status: SubscriptionStatus.TRIALING,
            trialStartedAt,
            trialEndsAt,
            graceEndsAt,
          },
        });

        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(rawVerificationToken),
            expiresAt: verificationExpires,
          },
        });

        await this.audit.record(
          {
            action: 'auth.signup',
            entityType: 'User',
            entityId: user.id,
            actorUserId: user.id,
            organizationId: organization.id,
            metadata: { email },
            ...requestMeta,
          },
          tx,
        );
        await this.audit.record(
          {
            action: 'organization.created',
            entityType: 'Organization',
            entityId: organization.id,
            actorUserId: user.id,
            organizationId: organization.id,
            metadata: { name: organization.name, slug: organization.slug },
            ...requestMeta,
          },
          tx,
        );
        await this.audit.record(
          {
            action: AUDIT_TRIAL_STARTED,
            entityType: 'Subscription',
            entityId: organization.id,
            actorUserId: user.id,
            organizationId: organization.id,
            newValues: {
              status: SubscriptionStatus.TRIALING,
              planCode: TRIAL_PLAN_CODE,
              trialStartedAt: trialStartedAt.toISOString(),
              trialEndsAt: trialEndsAt.toISOString(),
              graceEndsAt: graceEndsAt.toISOString(),
            },
            ...requestMeta,
          },
          tx,
        );

        return { user, organization };
      });

      await this.mail.sendEmailVerification(email, rawVerificationToken);
      const tokens = await this.issueSession(result.user.id, request);
      return {
        user: toPublicUser(result.user),
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
        },
        emailVerificationRequired: true,
        ...tokens,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account with this email already exists');
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
      throw new UnauthorizedException('Invalid credentials');
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
      throw new ForbiddenException('Account is inactive');
    }

    const tokens = await this.issueSession(user.id, request);
    await this.audit.record({
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      metadata: { email },
      ...requestMeta,
    });

    return { user: toPublicUser(user), ...tokens };
  }

  async logout(request: Request, userId?: string) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    let actorId = userId;
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
          secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        });
        actorId = actorId ?? payload.sub;
        if (payload.sid) {
          await this.prisma.refreshSession.updateMany({
            where: { id: payload.sid, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      } catch {
        // Cookie may already be invalid; still clear it.
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

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueSession(user.id, request);
    return { user: toPublicUser(user), ...tokens };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toPublicUser(user);
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
      },
    }));
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (
      !record ||
      record.consumedAt ||
      record.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    return { verified: true };
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
    const taken = await tx.organization.findUnique({ where: { slug: base } });
    if (!taken) {
      return base;
    }
    return `${base}-${randomBytes(3).toString('hex')}`;
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
