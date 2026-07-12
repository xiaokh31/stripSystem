import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
import { PrismaService } from '../prisma/prisma.service';

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
    const refreshExpiresIn = 60 * 60 * 24 * 400;
    const session = await this.prisma.nativeAuthSession.create({
      data: {
        userId: user.id,
        deviceId: dto.deviceId.trim(),
        platform: dto.platform?.trim() || null,
        appVersion: dto.appVersion?.trim() || null,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
      },
    });
    return this.nativeSessionResponse(
      profile,
      refreshToken,
      refreshExpiresIn,
      session.id,
    );
  }

  async refreshNativeSession(
    refreshToken: string,
  ): Promise<NativeSessionResponseDto> {
    const hash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.nativeAuthSession.findFirst({
      where: {
        OR: [{ refreshTokenHash: hash }, { previousRefreshTokenHash: hash }],
      },
      include: { user: { include: AUTH_USER_INCLUDE } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw this.nativeRefreshFailure('AUTH_REFRESH_EXPIRED');
    }
    if (session.previousRefreshTokenHash === hash) {
      await this.prisma.nativeAuthSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw this.nativeRefreshFailure('AUTH_REFRESH_REPLAYED');
    }
    if (!session.user.isActive) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'This user is inactive.',
        details: {},
      });
    }
    const profile = this.toUserProfile(session.user);
    if (this.isSystemUser(session.user, profile.roles))
      throw this.nativeRefreshFailure('AUTH_SESSION_REVOKED');
    const nextRefreshToken = this.newRefreshToken();
    await this.prisma.nativeAuthSession.update({
      where: { id: session.id },
      data: {
        previousRefreshTokenHash: hash,
        refreshTokenHash: this.hashRefreshToken(nextRefreshToken),
        lastUsedAt: new Date(),
        rotatedAt: new Date(),
      },
    });
    return this.nativeSessionResponse(
      profile,
      nextRefreshToken,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
      session.id,
    );
  }

  async revokeNativeSession(
    refreshToken: string,
  ): Promise<{ revoked: boolean }> {
    const hash = this.hashRefreshToken(refreshToken);
    await this.prisma.nativeAuthSession.updateMany({
      where: {
        OR: [{ refreshTokenHash: hash }, { previousRefreshTokenHash: hash }],
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  async revokeAllNativeSessionsForUser(
    userId: string,
  ): Promise<{ revokedCount: number }> {
    const result = await this.prisma.nativeAuthSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revokedCount: result.count };
  }

  async authenticateBearer(
    authorization: string | undefined,
  ): Promise<AuthenticatedUser> {
    const payload = this.tokenService.verifyBearerHeader(authorization);
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
    refreshExpiresIn: number,
    sessionId: string,
  ): NativeSessionResponseDto {
    const token = this.tokenService.sign(
      { sub: profile.id, email: profile.email, roles: profile.roles },
      60 * 15,
    );
    return {
      accessToken: token.accessToken,
      expiresIn: token.expiresIn,
      refreshExpiresIn,
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
