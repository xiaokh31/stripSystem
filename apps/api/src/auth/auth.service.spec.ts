import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { PasswordService } from './password.service';
import { NativeRefreshRateLimiter } from './native-refresh-rate-limiter.service';

describe('AuthService', () => {
  let prisma: any;
  let passwordService: PasswordService;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      $queryRaw: jest.fn(),
      nativeAuthSession: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      nativeRefreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    passwordService = new PasswordService();
    service = new AuthService(
      prisma,
      passwordService,
      new AuthTokenService(configService()),
      configService(),
      new NativeRefreshRateLimiter(configService()),
    );
  });

  it('logs in an active non-system user, returns roles and permissions, and updates last_login_at', async () => {
    const user = await userRecord({
      passwordHash: await passwordService.hashPassword('Correct#123'),
    });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, lastLoginAt: new Date() });

    const result = await service.login({
      email: 'OFFICE@EXAMPLE.COM',
      password: 'Correct#123',
    });

    expect(result).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-office',
        email: 'office@example.com',
        name: 'Office User',
        roles: ['OFFICE'],
        permissions: ['imports.read', 'reports.generate'],
      },
    });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'office@example.com' },
      include: expect.any(Object),
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-office' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('rejects an incorrect password with INVALID_CREDENTIALS', async () => {
    prisma.user.findUnique.mockResolvedValue(
      await userRecord({
        passwordHash: await passwordService.hashPassword('Correct#123'),
      }),
    );

    await expect(
      service.login({
        email: 'office@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login({
        email: 'office@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });
  });

  it('rejects inactive users and ordinary SYSTEM user login', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      await userRecord({ isActive: false }),
    );
    await expect(
      service.login({ email: 'office@example.com', password: 'Correct#123' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'USER_INACTIVE' }),
    });

    prisma.user.findUnique.mockResolvedValueOnce(
      await userRecord({
        id: 'user-system',
        email: 'system@example.com',
        role: 'SYSTEM',
        roleAssignments: [
          {
            role: {
              code: 'SYSTEM',
              isActive: true,
              permissions: [],
            },
          },
        ],
      }),
    );
    const systemLogin = service.login({
      email: 'system@example.com',
      password: 'Correct#123',
    });
    await expect(systemLogin).rejects.toBeInstanceOf(ForbiddenException);
    await expect(systemLogin).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SYSTEM_USER_LOGIN_NOT_ALLOWED',
      }),
    });
  });

  it('creates a short-access Native session with only refresh hashes in persistence', async () => {
    const user = await userRecord();
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);
    prisma.nativeAuthSession.create.mockImplementation(({ data }) => ({
      id: 'native-session-1',
      ...data,
    }));

    const result = await service.nativeLogin({
      appVersion: '1.2.3',
      deviceId: ' device-1 ',
      email: 'office@example.com',
      password: 'Correct#123',
      platform: 'android',
    });

    expect(result).toMatchObject({
      expiresIn: 900,
      refreshToken: expect.any(String),
      sessionId: 'native-session-1',
    });
    expect(result.refreshToken).not.toBe(result.accessToken);
    const data = prisma.nativeAuthSession.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      absoluteExpiresAt: expect.any(Date),
      appVersion: '1.2.3',
      deviceId: 'device-1',
      expiresAt: expect.any(Date),
      platform: 'android',
      refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      refreshTokens: {
        create: {
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    });
    expect(JSON.stringify(data)).not.toContain(result.refreshToken);
    expect(JSON.stringify(data)).not.toContain(result.accessToken);
  });

  it('rotates one refresh token and revokes the family when a consumed token is replayed', async () => {
    const user = await userRecord();
    const session = nativeSessionRecord(user);
    const token = {
      id: 'refresh-1',
      sessionId: session.id,
      tokenHash: 'hash',
      issuedAt: new Date(),
      usedAt: new Date(),
      revokedAt: null,
      expiresAt: session.expiresAt,
      replacedByTokenHash: 'next-hash',
    };
    prisma.nativeRefreshToken.findUnique
      .mockResolvedValueOnce({ sessionId: session.id })
      .mockResolvedValueOnce(token);
    prisma.nativeAuthSession.findUnique.mockResolvedValue(session);
    prisma.nativeAuthSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.nativeRefreshToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.refreshNativeSession('replayed-token'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_REFRESH_REPLAYED' }),
    });
    expect(prisma.nativeAuthSession.updateMany).toHaveBeenCalledWith({
      where: { id: session.id, revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokeReason: 'REFRESH_REPLAY',
      },
    });
    expect(prisma.nativeRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { sessionId: session.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects a Native access token immediately after its server session is revoked', async () => {
    const token = new AuthTokenService(configService()).sign(
      {
        email: 'office@example.com',
        nativeSessionId: 'native-session-1',
        roles: ['OFFICE'],
        sub: 'user-office',
      },
      900,
    );
    prisma.nativeAuthSession.findUnique.mockResolvedValue({
      absoluteExpiresAt: new Date(Date.now() + 10_000),
      expiresAt: new Date(Date.now() + 10_000),
      revokedAt: new Date(),
      userId: 'user-office',
    });

    await expect(
      service.authenticateBearer(`Bearer ${token.accessToken}`),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_SESSION_REVOKED' }),
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  async function userRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-office',
      email: 'office@example.com',
      name: 'Office User',
      passwordHash: await passwordService.hashPassword('Correct#123'),
      role: 'OFFICE',
      isActive: true,
      roleAssignments: [
        {
          role: {
            code: 'OFFICE',
            isActive: true,
            permissions: [
              { permission: { code: 'imports.read' } },
              { permission: { code: 'reports.generate' } },
            ],
          },
        },
      ],
      ...overrides,
    };
  }

  function nativeSessionRecord(user: Awaited<ReturnType<typeof userRecord>>) {
    return {
      absoluteExpiresAt: new Date(Date.now() + 86_400_000),
      appVersion: '1.2.3',
      createdAt: new Date(),
      deviceId: 'device-1',
      expiresAt: new Date(Date.now() + 86_400_000),
      id: 'native-session-1',
      lastUsedAt: new Date(),
      platform: 'android',
      previousRefreshTokenHash: null,
      refreshTokenHash: 'hash',
      revokeReason: null,
      revokedAt: null,
      revokedByUserId: null,
      rotatedAt: null,
      user,
      userId: user.id,
    };
  }

  function configService(): ConfigService {
    return {
      get: jest.fn((key: string) => {
        if (key === 'app.jwtSecret') {
          return 'unit-test-secret';
        }
        if (key === 'app.jwtExpiresInSeconds') {
          return 900;
        }
        if (key === 'app.nativeAccessTokenExpiresInSeconds') {
          return 900;
        }
        if (key === 'app.nativeSessionIdleExpiresInSeconds') {
          return 86_400;
        }
        if (key === 'app.nativeSessionAbsoluteExpiresInSeconds') {
          return 31_536_000;
        }
        return undefined;
      }),
    } as unknown as ConfigService;
  }
});
