import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { canonicalClientAddress } from '../common/trusted-proxy';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import {
  BROWSER_REFRESH_CONCURRENCY_GRACE_MS,
} from './browser-session.constants';
import type { LoginDto } from './dto/login.dto';
import type {
  AuthUserResponseDto,
  BrowserSessionResponseDto,
} from './dto/auth-response.dto';
import { DistributedAuthRateLimiter } from './distributed-auth-rate-limiter.service';

const AUTH_USER_INCLUDE = {
  roleAssignments: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
};

export interface BrowserSessionResult extends BrowserSessionResponseDto {
  cookieValues: {
    accessToken: string;
    accessExpiresInSeconds: number;
    csrfToken: string;
    refreshToken: string;
    refreshExpiresAt: Date;
  };
}

@Injectable()
export class BrowserSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly tokenService: AuthTokenService,
    private readonly configService: ConfigService,
    private readonly rateLimiter: DistributedAuthRateLimiter,
  ) {}

  async login(dto: LoginDto, request: Request): Promise<BrowserSessionResult> {
    if (this.configuration.enabled) this.assertAllowedOrigin(request);
    const clientAddress = this.clientAddress(request);
    try {
      await this.rateLimiter.assertAllowed(
        'browser-login',
        `${clientAddress ?? 'unknown'}:${dto.email.trim().toLowerCase()}`,
      );
    } catch (error) {
      if (this.httpCode(error) === 'AUTH_RATE_LIMITED') {
        await this.writeAudit('AUTH_RATE_LIMITED', {
          clientAddress,
          metadata: { scope: 'browser-login' },
        });
      }
      throw error;
    }

    let profile: AuthUserResponseDto;
    try {
      profile = await this.authService.validateLoginCredentials(dto);
    } catch {
      await this.writeAudit('BROWSER_LOGIN_FAILED', {
        clientAddress,
        metadata: { reason: 'INVALID_CREDENTIALS' },
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Sign-in was rejected.',
        details: {},
      });
    }

    const now = new Date();
    const absoluteExpiresAt = new Date(
      now.getTime() +
        this.configuration.browserSessionAbsoluteExpiresInSeconds * 1_000,
    );
    const refreshExpiresAt = this.refreshExpiry(now, absoluteExpiresAt);
    const refreshToken = this.newSecret();
    const csrfToken = this.newSecret();
    const refreshTokenHash = this.hash(refreshToken);
    const session = await this.prisma.nativeAuthSession.create({
      data: {
        absoluteExpiresAt,
        appVersion: null,
        clientType: 'BROWSER',
        createdIpHash: this.optionalHash(clientAddress),
        csrfTokenHash: this.hash(csrfToken),
        deviceId: this.browserDeviceSummary(request),
        expiresAt: refreshExpiresAt,
        platform: 'browser',
        refreshTokenHash,
        userAgentHash: this.optionalHash(request.get('user-agent')),
        userId: profile.id,
        refreshTokens: {
          create: { tokenHash: refreshTokenHash, expiresAt: refreshExpiresAt },
        },
      },
    });
    await this.writeAudit('BROWSER_LOGIN_SUCCEEDED', {
      clientAddress,
      sessionId: session.id,
      userId: profile.id,
    });
    return this.result(profile, session.id, refreshToken, csrfToken, refreshExpiresAt);
  }

  async refresh(
    refreshToken: string,
    csrfToken: string,
    request: Request,
  ): Promise<BrowserSessionResult> {
    this.assertAllowedOrigin(request);
    const hash = this.hash(refreshToken);
    const clientAddress = this.clientAddress(request);
    try {
      await this.rateLimiter.assertAllowed(
        'browser-refresh',
        `${clientAddress ?? 'unknown'}:${hash}`,
      );
    } catch (error) {
      if (this.httpCode(error) === 'AUTH_RATE_LIMITED') {
        await this.writeAudit('AUTH_RATE_LIMITED', {
          clientAddress,
          metadata: { scope: 'browser-refresh' },
        });
      }
      throw error;
    }
    const candidate = await this.prisma.nativeRefreshToken.findUnique({
      where: { tokenHash: hash },
      select: { sessionId: true },
    });
    if (!candidate) throw this.refreshFailure('AUTH_REFRESH_EXPIRED');

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "native_auth_sessions" WHERE "id" = ${candidate.sessionId} FOR UPDATE`;
      const [session, token] = await Promise.all([
        tx.nativeAuthSession.findUnique({
          where: { id: candidate.sessionId },
          include: { user: { include: AUTH_USER_INCLUDE } },
        }),
        tx.nativeRefreshToken.findUnique({ where: { tokenHash: hash } }),
      ]);
      if (!session || !token || session.clientType !== 'BROWSER') {
        return { kind: 'error' as const, code: 'AUTH_REFRESH_EXPIRED' as const };
      }
      const now = new Date();
      if (session.revokedAt) {
        return { kind: 'error' as const, code: 'AUTH_SESSION_REVOKED' as const };
      }
      if (token.usedAt || token.revokedAt) {
        if (
          token.usedAt &&
          now.getTime() - token.usedAt.getTime() <=
            BROWSER_REFRESH_CONCURRENCY_GRACE_MS
        ) {
          return { kind: 'error' as const, code: 'AUTH_REFRESH_CONCURRENT' as const };
        }
        await this.revokeFamily(tx, session.id, now, 'REFRESH_REPLAY');
        await tx.authAuditEvent.create({
          data: {
            clientAddressHash: this.optionalHash(clientAddress),
            eventCode: 'BROWSER_REFRESH_REUSED',
            sessionId: session.id,
            userId: session.userId,
          },
        });
        return { kind: 'error' as const, code: 'AUTH_REFRESH_REPLAYED' as const };
      }
      if (!this.secretMatches(csrfToken, session.csrfTokenHash)) {
        await tx.authAuditEvent.create({
          data: {
            clientAddressHash: this.optionalHash(clientAddress),
            eventCode: 'CSRF_REJECTED',
            sessionId: session.id,
            userId: session.userId,
          },
        });
        return { kind: 'error' as const, code: 'CSRF_REJECTED' as const };
      }
      if (
        token.expiresAt <= now ||
        session.expiresAt <= now ||
        session.absoluteExpiresAt <= now
      ) {
        await this.revokeFamily(tx, session.id, now, 'EXPIRED');
        return { kind: 'error' as const, code: 'AUTH_REFRESH_EXPIRED' as const };
      }
      if (!session.user.isActive) {
        await this.revokeFamily(tx, session.id, now, 'USER_INACTIVE');
        return { kind: 'error' as const, code: 'USER_INACTIVE' as const };
      }

      const nextRefreshToken = this.newSecret();
      const nextHash = this.hash(nextRefreshToken);
      const nextCsrfToken = this.newSecret();
      const nextExpiresAt = this.refreshExpiry(now, session.absoluteExpiresAt);
      const consumed = await tx.nativeRefreshToken.updateMany({
        where: { id: token.id, usedAt: null, revokedAt: null },
        data: { usedAt: now, replacedByTokenHash: nextHash },
      });
      if (consumed.count !== 1) {
        return { kind: 'error' as const, code: 'AUTH_REFRESH_CONCURRENT' as const };
      }
      await tx.nativeRefreshToken.create({
        data: {
          expiresAt: nextExpiresAt,
          sessionId: session.id,
          tokenHash: nextHash,
        },
      });
      await tx.nativeAuthSession.update({
        where: { id: session.id },
        data: {
          csrfTokenHash: this.hash(nextCsrfToken),
          expiresAt: nextExpiresAt,
          lastUsedAt: now,
          previousRefreshTokenHash: hash,
          refreshTokenHash: nextHash,
          rotatedAt: now,
        },
      });
      await tx.authAuditEvent.create({
        data: {
          clientAddressHash: this.optionalHash(clientAddress),
          eventCode: 'BROWSER_REFRESH_SUCCEEDED',
          sessionId: session.id,
          userId: session.userId,
        },
      });
      return {
        kind: 'success' as const,
        csrfToken: nextCsrfToken,
        profile: this.toUserProfile(session.user),
        refreshExpiresAt: nextExpiresAt,
        refreshToken: nextRefreshToken,
        sessionId: session.id,
      };
    });

    if (outcome.kind === 'error') {
      if (outcome.code === 'CSRF_REJECTED') {
        throw new ForbiddenException({ code: outcome.code, message: 'Request rejected.', details: {} });
      }
      if (outcome.code === 'USER_INACTIVE') {
        throw new ForbiddenException({ code: outcome.code, message: 'Session rejected.', details: {} });
      }
      if (outcome.code === 'AUTH_REFRESH_CONCURRENT') {
        throw new HttpException(
          { code: outcome.code, message: 'Refresh already in progress.', details: { retry: true } },
          HttpStatus.CONFLICT,
        );
      }
      throw this.refreshFailure(outcome.code);
    }
    return this.result(
      outcome.profile,
      outcome.sessionId,
      outcome.refreshToken,
      outcome.csrfToken,
      outcome.refreshExpiresAt,
    );
  }

  async logout(
    refreshToken: string | null,
    csrfToken: string | null,
    request: Request,
  ): Promise<{ revoked: true }> {
    if (!refreshToken) return { revoked: true };
    this.assertAllowedOrigin(request);
    const hash = this.hash(refreshToken);
    const candidate = await this.prisma.nativeRefreshToken.findUnique({
      where: { tokenHash: hash },
      select: { sessionId: true },
    });
    if (!candidate) return { revoked: true };
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "native_auth_sessions" WHERE "id" = ${candidate.sessionId} FOR UPDATE`;
      const session = await tx.nativeAuthSession.findUnique({
        where: { id: candidate.sessionId },
      });
      if (!session || session.clientType !== 'BROWSER') return;
      if (!csrfToken || !this.secretMatches(csrfToken, session.csrfTokenHash)) {
        throw new ForbiddenException({ code: 'CSRF_REJECTED', message: 'Request rejected.', details: {} });
      }
      const now = new Date();
      await this.revokeFamily(tx, session.id, now, 'BROWSER_LOGOUT');
      await tx.authAuditEvent.create({
        data: {
          clientAddressHash: this.optionalHash(this.clientAddress(request)),
          eventCode: 'BROWSER_LOGOUT',
          sessionId: session.id,
          userId: session.userId,
        },
      });
    });
    return { revoked: true };
  }

  async validateCsrf(sessionId: string, csrfToken: string): Promise<boolean> {
    const session = await this.prisma.nativeAuthSession.findUnique({
      where: { id: sessionId },
      select: { clientType: true, csrfTokenHash: true, revokedAt: true },
    });
    return Boolean(
      session &&
        session.clientType === 'BROWSER' &&
        !session.revokedAt &&
        this.secretMatches(csrfToken, session.csrfTokenHash),
    );
  }

  async recordCsrfRejection(sessionId: string, request: Request) {
    await this.prisma.authAuditEvent.create({
      data: {
        clientAddressHash: this.optionalHash(this.clientAddress(request)),
        eventCode: 'CSRF_REJECTED',
        sessionId: sessionId || null,
      },
    });
  }

  async revokeAllForUser(userId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.nativeAuthSession.findMany({
        where: { clientType: 'BROWSER', revokedAt: null, userId },
        select: { id: true },
      });
      const sessionIds = sessions.map((session) => session.id);
      if (sessionIds.length === 0) return { revokedCount: 0 };
      const now = new Date();
      const updated = await tx.nativeAuthSession.updateMany({
        where: { clientType: 'BROWSER', id: { in: sessionIds }, revokedAt: null },
        data: {
          revokeReason: 'ADMIN_REVOKE_ALL',
          revokedAt: now,
          revokedByUserId: actorUserId,
        },
      });
      await tx.nativeRefreshToken.updateMany({
        where: { revokedAt: null, sessionId: { in: sessionIds } },
        data: { revokedAt: now },
      });
      await tx.authAuditEvent.createMany({
        data: sessionIds.map((sessionId) => ({
          actorUserId,
          eventCode: 'BROWSER_SESSION_REVOKED' as const,
          sessionId,
          userId,
        })),
      });
      return { revokedCount: updated.count };
    });
  }

  assertAllowedOrigin(request: Request): void {
    const supplied = request.get('origin') ?? request.get('referer');
    let origin: string | null = null;
    try {
      origin = supplied ? new URL(supplied).origin : null;
    } catch {
      origin = null;
    }
    const sameRequestOrigin = `${request.protocol}://${request.get('host') ?? ''}`;
    const allowed = this.configuration.enabled
      ? Boolean(origin && this.configuration.allowedOrigins.includes(origin))
      : Boolean(origin && (origin === sameRequestOrigin || this.configuration.allowedOrigins.includes(origin)));
    if (!allowed) {
      throw new ForbiddenException({ code: 'CSRF_ORIGIN_REJECTED', message: 'Request origin rejected.', details: {} });
    }
  }

  private result(
    profile: AuthUserResponseDto,
    sessionId: string,
    refreshToken: string,
    csrfToken: string,
    refreshExpiresAt: Date,
  ): BrowserSessionResult {
    const token = this.tokenService.sign(
      {
        browserSessionId: sessionId,
        email: profile.email,
        roles: profile.roles,
        sub: profile.id,
      },
      this.configuration.browserAccessExpiresInSeconds,
    );
    return {
      accessExpiresAt: new Date(Date.now() + token.expiresIn * 1_000).toISOString(),
      cookieValues: {
        accessExpiresInSeconds: token.expiresIn,
        accessToken: token.accessToken,
        csrfToken,
        refreshExpiresAt,
        refreshToken,
      },
      expiresIn: token.expiresIn,
      sessionExpiresAt: refreshExpiresAt.toISOString(),
      user: profile,
    };
  }

  private async revokeFamily(
    tx: PrismaTransaction,
    sessionId: string,
    now: Date,
    reason: string,
  ) {
    await tx.nativeAuthSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
    await tx.nativeRefreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async writeAudit(
    eventCode:
      | 'AUTH_RATE_LIMITED'
      | 'BROWSER_LOGIN_FAILED'
      | 'BROWSER_LOGIN_SUCCEEDED',
    input: {
      clientAddress: string | null;
      metadata?: Record<string, unknown>;
      sessionId?: string;
      userId?: string;
    },
  ) {
    await this.prisma.authAuditEvent.create({
      data: {
        clientAddressHash: this.optionalHash(input.clientAddress),
        eventCode,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        sessionId: input.sessionId,
        userId: input.userId,
      },
    });
  }

  private toUserProfile(user: AuthUserRecord): AuthUserResponseDto {
    const assignments = user.roleAssignments.filter((item) => item.role.isActive);
    const roles = assignments.length > 0 ? assignments.map((item) => item.role.code) : [user.role];
    return {
      email: user.email,
      id: user.id,
      name: user.name,
      permissions: [...new Set(assignments.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code)))].sort(),
      roles: [...new Set(roles)].sort(),
    };
  }

  private refreshExpiry(now: Date, absoluteExpiresAt: Date) {
    return new Date(
      Math.min(
        now.getTime() + this.configuration.browserSessionIdleExpiresInSeconds * 1_000,
        absoluteExpiresAt.getTime(),
      ),
    );
  }

  private get configuration(): PublicDeploymentConfiguration {
    const value = this.configService.get<PublicDeploymentConfiguration>('app.publicDeployment');
    if (!value) throw new Error('TYPED_PUBLIC_CONFIG_REQUIRED');
    return value;
  }

  private clientAddress(request: Request) {
    return canonicalClientAddress(request, this.configuration);
  }

  private browserDeviceSummary(request: Request) {
    return `browser:${this.hash(request.get('user-agent') ?? 'unknown').slice(0, 24)}`;
  }

  private newSecret() {
    return randomBytes(48).toString('base64url');
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private optionalHash(value: string | null | undefined) {
    return value ? this.hash(value) : null;
  }

  private secretMatches(secret: string, expectedHash: string | null) {
    if (!expectedHash) return false;
    const actual = Buffer.from(this.hash(secret));
    const expected = Buffer.from(expectedHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private refreshFailure(
    code: 'AUTH_REFRESH_EXPIRED' | 'AUTH_REFRESH_REPLAYED' | 'AUTH_SESSION_REVOKED',
  ) {
    return new UnauthorizedException({ code, message: 'Browser session refresh was rejected.', details: {} });
  }

  private httpCode(error: unknown): string | null {
    if (!(error instanceof HttpException)) return null;
    const response = error.getResponse();
    return response && typeof response === 'object' && 'code' in response
      ? String(response.code)
      : null;
  }
}

interface PrismaTransaction {
  nativeAuthSession: PrismaService['nativeAuthSession'];
  nativeRefreshToken: PrismaService['nativeRefreshToken'];
}

interface AuthUserRecord {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  isActive: boolean;
  roleAssignments: Array<{
    role: {
      code: string;
      isActive: boolean;
      permissions: Array<{ permission: { code: string } }>;
    };
  }>;
}
