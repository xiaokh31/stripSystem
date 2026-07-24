import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { AuthTokenService } from './../src/auth/auth-token.service';
import { installBrowserAuthStorageMock } from './auth-test-helpers';

const CORRECT_PASSWORD_HASH =
  'scrypt$16384$8$1$64$cDEtMTAtYXV0aC10ZXN0IQ$wYMkqowHtka032P4dANTJudj8uOgLMLiia_HVRbPCHqsNXriCkT2KY3pBafDEdNWj1Pv9p4cV_7cU94RzAIMeQ';

interface LoginBody {
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    permissions: string[];
  };
}

interface ErrorBody {
  code: string;
}

interface UserFixture {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  roleAssignments: Array<{
    role: {
      code: string;
      isActive: boolean;
      permissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
}

describe('AuthController (e2e)', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtExpiresInSeconds = process.env.JWT_EXPIRES_IN_SECONDS;
  let app: INestApplication<App>;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let usersByEmail: Map<string, UserFixture>;
  let usersById: Map<string, UserFixture>;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.JWT_EXPIRES_IN_SECONDS = '900';
    const users = [
      await userFixture({
        passwordHash: CORRECT_PASSWORD_HASH,
      }),
      await userFixture({
        id: 'user-inactive',
        email: 'inactive@example.com',
        isActive: false,
      }),
      await userFixture({
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
    ];
    usersByEmail = new Map(users.map((user) => [user.email, user]));
    usersById = new Map(users.map((user) => [user.id, user]));
    prisma = {
      user: {
        findUnique: jest.fn(({ where }: { where: UserWhereUnique }) => {
          if (where.email) {
            return Promise.resolve(usersByEmail.get(where.email) ?? null);
          }
          if (where.id) {
            return Promise.resolve(usersById.get(where.id) ?? null);
          }
          return Promise.resolve(null);
        }),
        update: jest.fn(({ where, data }: UserUpdateArgs) => {
          const user = usersById.get(where.id);
          if (!user) {
            return Promise.resolve(null);
          }
          Object.assign(user, data);
          return Promise.resolve(user);
        }),
      },
    };
    installBrowserAuthStorageMock(prisma);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('POST /api/auth/login creates HttpOnly browser cookies without returning secrets', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'OFFICE@example.com', password: 'Correct#123' })
      .expect(201);
    const body = response.body as LoginBody;

    expect(body).toMatchObject({
      expiresIn: 900,
      user: {
        id: 'user-office',
        email: 'office@example.com',
        name: 'Office User',
        roles: ['OFFICE'],
        permissions: ['imports.read', 'reports.generate'],
      },
    });
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^bestar_access=.*HttpOnly/),
        expect.stringMatching(/^bestar_refresh=.*HttpOnly/),
        expect.stringMatching(/^bestar_csrf=/),
      ]),
    );
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(usersById.get('user-office')?.lastLoginAt).toBeInstanceOf(Date);
  });

  it('POST /api/auth/login uses one response for wrong, inactive, and SYSTEM accounts', async () => {
    for (const credentials of [
      { email: 'office@example.com', password: 'wrong-password' },
      { email: 'inactive@example.com', password: 'Correct#123' },
      { email: 'system@example.com', password: 'Correct#123' },
    ]) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials)
        .expect(401)
        .expect((response) => {
          expect((response.body as ErrorBody).code).toBe(
            'INVALID_CREDENTIALS',
          );
        });
    }
  });

  it('GET /api/auth/me requires authentication and accepts the browser cookie', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('UNAUTHENTICATED');
      });

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: 'office@example.com', password: 'Correct#123' })
      .expect(201);

    await agent
      .get('/api/auth/me')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 'user-office',
          email: 'office@example.com',
          name: 'Office User',
          roles: ['OFFICE'],
          permissions: ['imports.read', 'reports.generate'],
        });
        expect(response.body).not.toHaveProperty('passwordHash');
      });
  });

  it('rejects an existing token on the next request after the user is disabled', async () => {
    const authorization = authHeaderForFixture(usersById.get('user-office')!);

    const user = usersById.get('user-office');
    expect(user).toBeDefined();
    user!.isActive = false;

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', authorization)
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('USER_INACTIVE');
      });
  });

  it('uses current database permissions on the next request instead of stale token claims', async () => {
    const authorization = authHeaderForFixture(usersById.get('user-office')!);

    const user = usersById.get('user-office');
    expect(user).toBeDefined();
    user!.roleAssignments[0].role.permissions = [];

    await request(app.getHttpServer())
      .get('/api/imports')
      .set('Authorization', authorization)
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });
  });

  it('validates login DTOs', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email' })
      .expect(400)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('BAD_REQUEST');
      });
  });

  afterEach(async () => {
    restoreEnv('JWT_SECRET', originalJwtSecret);
    restoreEnv('JWT_EXPIRES_IN_SECONDS', originalJwtExpiresInSeconds);
    await app.close();
  });

  async function userFixture(
    overrides: Partial<UserFixture> = {},
  ): Promise<UserFixture> {
    return {
      id: 'user-office',
      email: 'office@example.com',
      name: 'Office User',
      passwordHash: CORRECT_PASSWORD_HASH,
      role: 'OFFICE',
      isActive: true,
      lastLoginAt: null,
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
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function authHeaderForFixture(user: UserFixture): string {
  const tokenService = new AuthTokenService({
    get: (key: string) =>
      key === 'app.jwtSecret'
        ? 'e2e-test-secret'
        : key === 'app.jwtExpiresInSeconds'
          ? 900
          : undefined,
  } as never);
  return `Bearer ${
    tokenService.sign({
      sub: user.id,
      email: user.email,
      roles: [user.role],
    }).accessToken
  }`;
}

interface UserWhereUnique {
  id?: string;
  email?: string;
}

interface UserUpdateArgs {
  where: {
    id: string;
  };
  data: Partial<UserFixture>;
}
