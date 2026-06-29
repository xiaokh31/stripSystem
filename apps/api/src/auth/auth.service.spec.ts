import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  let prisma: any;
  let passwordService: PasswordService;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
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

  function configService(): ConfigService {
    return {
      get: jest.fn((key: string) => {
        if (key === 'app.jwtSecret') {
          return 'unit-test-secret';
        }
        if (key === 'app.jwtExpiresInSeconds') {
          return 900;
        }
        return undefined;
      }),
    } as unknown as ConfigService;
  }
});
