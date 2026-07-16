import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { LoginDto } from './dto/login.dto';
import {
  AuthUserResponseDto,
  LoginResponseDto,
  NativeSessionResponseDto,
} from './dto/auth-response.dto';
import { NativeLoginDto } from './dto/native-session.dto';
import { AuthTokenService } from './auth-token.service';
import { AuthenticatedUser } from './auth-user';
import { PasswordService } from './password.service';
import { NativeRefreshRateLimiter } from './native-refresh-rate-limiter.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  DEFAULT_NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
  DEFAULT_NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS,
} from '../config/native-auth.constants';

const AUTH_USER_INCLUDE = {
  roleAssignments: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: AuthTokenService,
    private readonly configService: ConfigService,
    private readonly nativeRefreshRateLimiter: NativeRefreshRateLimiter,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.findUserByEmail(email);
    if (!user) {
      throw this.invalidCredentials();
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'This user is inactive.',
        details: {},
      });
    }

    const profile = this.toUserProfile(user);
    if (this.isSystemUser(user, profile.roles)) {
      throw new ForbiddenException({
        code: 'SYSTEM_USER_LOGIN_NOT_ALLOWED',
        message: 'SYSTEM users cannot use ordinary password login.',
        details: {},
      });
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.tokenService.sign({
      sub: user.id,
      email: user.email,
      roles: profile.roles,
    });

    return {
      accessToken: token.accessToken,
      tokenType: 'Bearer',
      expiresIn: token.expiresIn,
      user: profile,
    };
  }

  async getCurrentUser(
    authorization: string | undefined,
  ): Promise<AuthUserResponseDto> {
    return this.authenticateBearer(authorization);
  }

  async nativeLogin(dto: NativeLoginDto): Promise<NativeSessionResponseDto> {
    await this.login(dto);
    const user = await this.findUserByEmail(this.normalizeEmail(dto.email));
    if (!user) throw this.invalidCredentials();
    const profile = this.toUserProfile(user);
    const refreshToken = this.newRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const now = new Date();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.nativeSessionAbsoluteExpiresInSeconds * 1000,
    );
    const refreshExpiresAt = this.rollingRefreshExpiry(now, absoluteExpiresAt);
    const session = await this.prisma.nativeAuthSession.create({
      data: {
        userId: user.id,
        deviceId: dto.deviceId.trim(),
        platform: dto.platform?.trim() || null,
        appVersion: dto.appVersion?.trim() || null,
        refreshTokenHash,
        expiresAt: refreshExpiresAt,
        absoluteExpiresAt,
        refreshTokens: {
          create: {
            tokenHash: refreshTokenHash,
            expiresAt: refreshExpiresAt,
          },
        },
      },
    });
    return this.nativeSessionResponse(
      profile,
      refreshToken,
      refreshExpiresAt,
      session.id,
    );
  }

  async refreshNativeSession(
    refreshToken: string,
  ): Promise<NativeSessionResponseDto> {
    const hash = this.hashRefreshToken(refreshToken);
    this.nativeRefreshRateLimiter.assertAllowed(hash);
    const candidate = await this.prisma.nativeRefreshToken.findUnique({
      where: { tokenHash: hash },
      select: { sessionId: true },
    });
    if (!candidate) {
      throw this.nativeRefreshFailure('AUTH_REFRESH_EXPIRED');
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "native_auth_sessions" WHERE "id" = ${candidate.sessionId} FOR UPDATE`;
      const [session, token] = await Promise.all([
        tx.nativeAuthSession.findUnique({
          where: { id: candidate.sessionId },
          include: { user: { include: AUTH_USER_INCLUDE } },
        }),
        tx.nativeRefreshToken.findUnique({ where: { tokenHash: hash } }),
      ]);
      if (!session || !token) {
        return {
          kind: 'error' as const,
          code: 'AUTH_REFRESH_EXPIRED' as const,
        };
      }

      const now = new Date();
      const revoke = async (
        reason: 'EXPIRED' | 'REFRESH_REPLAY' | 'SYSTEM_USER',
      ) => {
        await tx.nativeAuthSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: reason },
        });
        await tx.nativeRefreshToken.updateMany({
          where: { sessionId: session.id, revokedAt: null },
          data: { revokedAt: now },
        });
      };

      if (session.revokedAt) {
        return {
          kind: 'error' as const,
          code: 'AUTH_SESSION_REVOKED' as const,
        };
      }
      if (token.usedAt || token.revokedAt) {
        await revoke('REFRESH_REPLAY');
        return {
          kind: 'error' as const,
          code: 'AUTH_REFRESH_REPLAYED' as const,
        };
      }
      if (
        token.expiresAt <= now ||
        session.expiresAt <= now ||
        session.absoluteExpiresAt <= now
      ) {
        await revoke('EXPIRED');
        return {
          kind: 'error' as const,
          code: 'AUTH_REFRESH_EXPIRED' as const,
        };
      }
      if (!session.user.isActive) {
        await tx.nativeAuthSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'USER_INACTIVE' },
        });
        await tx.nativeRefreshToken.updateMany({
          where: { sessionId: session.id, revokedAt: null },
          data: { revokedAt: now },
        });
        return { kind: 'error' as const, code: 'USER_INACTIVE' as const };
      }

      const profile = this.toUserProfile(session.user);
      if (this.isSystemUser(session.user, profile.roles)) {
        await revoke('SYSTEM_USER');
        return {
          kind: 'error' as const,
          code: 'AUTH_SESSION_REVOKED' as const,
        };
      }

      const nextRefreshToken = this.newRefreshToken();
      const nextHash = this.hashRefreshToken(nextRefreshToken);
      const nextExpiresAt = this.rollingRefreshExpiry(
        now,
        session.absoluteExpiresAt,
      );
      const consumed = await tx.nativeRefreshToken.updateMany({
        where: { id: token.id, usedAt: null, revokedAt: null },
        data: {
          usedAt: now,
          replacedByTokenHash: nextHash,
        },
      });
      if (consumed.count !== 1) {
        await revoke('REFRESH_REPLAY');
        return {
          kind: 'error' as const,
          code: 'AUTH_REFRESH_REPLAYED' as const,
        };
      }

      await tx.nativeRefreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: nextHash,
          expiresAt: nextExpiresAt,
        },
      });
      await tx.nativeAuthSession.update({
        where: { id: session.id },
        data: {
          previousRefreshTokenHash: hash,
          refreshTokenHash: nextHash,
          expiresAt: nextExpiresAt,
          lastUsedAt: now,
          rotatedAt: now,
        },
      });
      return {
        kind: 'success' as const,
        profile,
        refreshToken: nextRefreshToken,
        refreshExpiresAt: nextExpiresAt,
        sessionId: session.id,
      };
    });

    if (outcome.kind === 'error') {
      if (outcome.code === 'USER_INACTIVE') {
        throw new ForbiddenException({
          code: 'USER_INACTIVE',
          message: 'This user is inactive.',
          details: {},
        });
      }
      throw this.nativeRefreshFailure(outcome.code);
    }

    return this.nativeSessionResponse(
      outcome.profile,
      outcome.refreshToken,
      outcome.refreshExpiresAt,
      outcome.sessionId,
    );
  }

  async revokeNativeSession(
    refreshToken: string,
  ): Promise<{ revoked: boolean }> {
    const hash = this.hashRefreshToken(refreshToken);
    const candidate = await this.prisma.nativeRefreshToken.findUnique({
      where: { tokenHash: hash },
      select: { sessionId: true },
    });
    if (!candidate) {
      return { revoked: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "native_auth_sessions" WHERE "id" = ${candidate.sessionId} FOR UPDATE`;
      const now = new Date();
      await tx.nativeAuthSession.updateMany({
        where: { id: candidate.sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'NATIVE_LOGOUT' },
      });
      await tx.nativeRefreshToken.updateMany({
        where: { sessionId: candidate.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    return { revoked: true };
  }

  async revokeAllNativeSessionsForUser(
    userId: string,
    revokedByUserId: string,
  ): Promise<{ revokedCount: number }> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const activeSessions = await tx.nativeAuthSession.findMany({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      const sessionIds = activeSessions.map((session) => session.id);
      if (sessionIds.length === 0) {
        return { revokedCount: 0 };
      }
      const result = await tx.nativeAuthSession.updateMany({
        where: { id: { in: sessionIds }, revokedAt: null },
        data: {
          revokedAt: now,
          revokedByUserId,
          revokeReason: 'ADMIN_REVOKE_ALL',
        },
      });
      await tx.nativeRefreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now },
      });
      return { revokedCount: result.count };
    });
  }

  async authenticateBearer(
    authorization: string | undefined,
  ): Promise<AuthenticatedUser> {
    const payload = this.tokenService.verifyBearerHeader(authorization);
    if (payload.nativeSessionId) {
      const session = await this.prisma.nativeAuthSession.findUnique({
        where: { id: payload.nativeSessionId },
        select: {
          absoluteExpiresAt: true,
          expiresAt: true,
          revokedAt: true,
          userId: true,
        },
      });
      const now = new Date();
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= now ||
        session.absoluteExpiresAt <= now
      ) {
        throw this.nativeRefreshFailure('AUTH_SESSION_REVOKED');
      }
    }

    const user = await this.findUserById(payload.sub);
    if (!user) {
      throw this.unauthenticated('Authenticated user no longer exists.');
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'This user is inactive.',
        details: {},
      });
    }
    return this.toUserProfile(user);
  }

  private findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: AUTH_USER_INCLUDE,
    });
  }

  private findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: AUTH_USER_INCLUDE,
    });
  }

  private toUserProfile(user: AuthUserRecord): AuthUserResponseDto {
    const activeAssignments = user.roleAssignments.filter(
      (assignment) => assignment.role.isActive,
    );
    const roles =
      activeAssignments.length > 0
        ? activeAssignments.map((assignment) => assignment.role.code)
        : [user.role];
    const permissions = activeAssignments.flatMap((assignment) =>
      assignment.role.permissions.map((item) => item.permission.code),
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [...new Set(roles)].sort(),
      permissions: [...new Set(permissions)].sort(),
    };
  }

  private isSystemUser(user: AuthUserRecord, roles: string[]): boolean {
    return user.role === 'SYSTEM' || roles.includes('SYSTEM');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
      details: {},
    });
  }

  private unauthenticated(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message,
      details: {},
    });
  }

  private nativeSessionResponse(
    profile: AuthUserResponseDto,
    refreshToken: string,
    refreshExpiresAt: Date,
    sessionId: string,
  ): NativeSessionResponseDto {
    const token = this.tokenService.sign(
      {
        sub: profile.id,
        email: profile.email,
        roles: profile.roles,
        nativeSessionId: sessionId,
      },
      this.nativeAccessTokenExpiresInSeconds,
    );
    const accessExpiresAt = new Date(Date.now() + token.expiresIn * 1000);
    const refreshExpiresIn = Math.max(
      0,
      Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000),
    );
    return {
      accessToken: token.accessToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      expiresIn: token.expiresIn,
      refreshExpiresIn,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      refreshToken,
      sessionId,
      tokenType: 'Bearer',
      user: profile,
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private newRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private rollingRefreshExpiry(now: Date, absoluteExpiresAt: Date): Date {
    return new Date(
      Math.min(
        now.getTime() + this.nativeSessionIdleExpiresInSeconds * 1000,
        absoluteExpiresAt.getTime(),
      ),
    );
  }

  private get nativeAccessTokenExpiresInSeconds(): number {
    return this.positiveConfig(
      'app.nativeAccessTokenExpiresInSeconds',
      DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    );
  }

  private get nativeSessionIdleExpiresInSeconds(): number {
    return this.positiveConfig(
      'app.nativeSessionIdleExpiresInSeconds',
      DEFAULT_NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS,
    );
  }

  private get nativeSessionAbsoluteExpiresInSeconds(): number {
    return this.positiveConfig(
      'app.nativeSessionAbsoluteExpiresInSeconds',
      DEFAULT_NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
    );
  }

  private positiveConfig(key: string, fallback: number): number {
    const value = this.configService.get<number>(key);
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  private nativeRefreshFailure(
    code:
      | 'AUTH_REFRESH_EXPIRED'
      | 'AUTH_REFRESH_REPLAYED'
      | 'AUTH_SESSION_REVOKED',
  ): UnauthorizedException {
    return new UnauthorizedException({
      code,
      message: 'Native session refresh was rejected.',
      details: {},
    });
  }
}

interface AuthUserRecord {
  id: string;
  email: string | null;
  name: string | null;
  passwordHash: string | null;
  role: string;
  isActive: boolean;
  roleAssignments: RoleAssignmentRecord[];
}

interface RoleAssignmentRecord {
  role: {
    code: string;
    isActive: boolean;
    permissions: Array<{
      permission: {
        code: string;
      };
    }>;
  };
}
