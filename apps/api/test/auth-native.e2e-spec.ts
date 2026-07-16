import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD_HASH =
  'scrypt$16384$8$1$64$cDEtMTAtYXV0aC10ZXN0IQ$wYMkqowHtka032P4dANTJudj8uOgLMLiia_HVRbPCHqsNXriCkT2KY3pBafDEdNWj1Pv9p4cV_7cU94RzAIMeQ';

describe('Native revocable auth session (e2e)', () => {
  let app: INestApplication<App>;
  let fixture: NativeAuthPrismaFixture;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'native-auth-e2e-secret';
    process.env.NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS = '900';
    process.env.NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS = '34560000';
    process.env.NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS = '157680000';
    fixture = new NativeAuthPrismaFixture();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fixture.prisma)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('logs in with device identity, rotates refresh once, and revokes the family on replay', async () => {
    const login = await nativeLogin(app);
    expect(login.body).toMatchObject({
      accessExpiresAt: expect.any(String),
      expiresIn: 900,
      refreshExpiresAt: expect.any(String),
      refreshExpiresIn: expect.any(Number),
      refreshToken: expect.any(String),
      sessionId: expect.any(String),
    });
    expect(JSON.stringify(fixture.sessions)).not.toContain(
      login.body.refreshToken,
    );
    expect(JSON.stringify(fixture.tokens)).not.toContain(
      login.body.refreshToken,
    );

    const rotated = await request(app.getHttpServer())
      .post('/api/auth/native/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);
    expect(rotated.body.refreshToken).not.toBe(login.body.refreshToken);

    await request(app.getHttpServer())
      .post('/api/auth/native/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('AUTH_REFRESH_REPLAYED');
      });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('AUTH_SESSION_REVOKED');
      });
  });

  it('serializes concurrent refresh so one rotation wins and replay revokes the session', async () => {
    const login = await nativeLogin(app);
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/auth/native/refresh')
        .send({ refreshToken: login.body.refreshToken }),
      request(app.getHttpServer())
        .post('/api/auth/native/refresh')
        .send({ refreshToken: login.body.refreshToken }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 401,
    ]);
    expect(
      responses.find((response) => response.status === 401)?.body.code,
    ).toBe('AUTH_REFRESH_REPLAYED');
    expect(fixture.sessions.get(login.body.sessionId)?.revokeReason).toBe(
      'REFRESH_REPLAY',
    );
  });

  it('logout invalidates both refresh and session-bound access tokens', async () => {
    const login = await nativeLogin(app);
    await request(app.getHttpServer())
      .post('/api/auth/native/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201)
      .expect({ revoked: true });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/native/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('AUTH_SESSION_REVOKED');
      });
  });

  it('rate limits repeated refresh attempts without echoing the supplied secret', async () => {
    const suppliedSecret = 'unknown-native-refresh-secret';

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/native/refresh')
        .send({ refreshToken: suppliedSecret })
        .expect(401)
        .expect(({ body }) => {
          expect(body.code).toBe('AUTH_REFRESH_EXPIRED');
          expect(JSON.stringify(body)).not.toContain(suppliedSecret);
        });
    }

    await request(app.getHttpServer())
      .post('/api/auth/native/refresh')
      .send({ refreshToken: suppliedSecret })
      .expect(429)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 'AUTH_REFRESH_RATE_LIMITED',
          details: { retryAfterSeconds: expect.any(Number) },
        });
        expect(JSON.stringify(body)).not.toContain(suppliedSecret);
      });
  });

  it('rechecks active user state and lets an admin auditably revoke all user sessions', async () => {
    const inactiveLogin = await nativeLogin(app);
    fixture.users.get('warehouse@example.com')!.isActive = false;
    await request(app.getHttpServer())
      .post('/api/auth/native/refresh')
      .send({ refreshToken: inactiveLogin.body.refreshToken })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('USER_INACTIVE');
      });

    fixture.users.get('warehouse@example.com')!.isActive = true;
    const activeLogin = await nativeLogin(app);
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Correct#123' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/native/users/user-warehouse/revoke-sessions')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.revokedCount).toBe(1);
      });

    const session = fixture.sessions.get(activeLogin.body.sessionId);
    expect(session).toMatchObject({
      revokeReason: 'ADMIN_REVOKE_ALL',
      revokedByUserId: 'user-admin',
    });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${activeLogin.body.accessToken}`)
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});

async function nativeLogin(app: INestApplication<App>) {
  return request(app.getHttpServer())
    .post('/api/auth/native/login')
    .send({
      appVersion: '1.2.3',
      deviceId: 'android-pda-1',
      email: 'warehouse@example.com',
      password: 'Correct#123',
      platform: 'android',
    })
    .expect(201);
}

interface TestUser {
  email: string;
  id: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  name: string;
  passwordHash: string;
  role: string;
  roleAssignments: Array<{
    role: {
      code: string;
      isActive: boolean;
      permissions: Array<{ permission: { code: string } }>;
    };
  }>;
}

interface TestSession {
  absoluteExpiresAt: Date;
  appVersion: string | null;
  createdAt: Date;
  deviceId: string;
  expiresAt: Date;
  id: string;
  lastUsedAt: Date;
  platform: string | null;
  previousRefreshTokenHash: string | null;
  refreshTokenHash: string;
  revokeReason: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  rotatedAt: Date | null;
  userId: string;
}

interface TestRefreshToken {
  expiresAt: Date;
  id: string;
  issuedAt: Date;
  replacedByTokenHash: string | null;
  revokedAt: Date | null;
  sessionId: string;
  tokenHash: string;
  usedAt: Date | null;
}

class NativeAuthPrismaFixture {
  readonly sessions = new Map<string, TestSession>();
  readonly tokens = new Map<string, TestRefreshToken>();
  readonly users = new Map<string, TestUser>([
    [
      'warehouse@example.com',
      testUser('user-warehouse', 'warehouse@example.com', 'WAREHOUSE', [
        'load_jobs.read',
        'load_jobs.update',
        'load_jobs.complete',
        'scan.create',
      ]),
    ],
    [
      'admin@example.com',
      testUser('user-admin', 'admin@example.com', 'ADMIN', ['users.manage']),
    ],
  ]);
  private transactionTail = Promise.resolve();
  private nextId = 1;

  readonly prisma = {
    $queryRaw: async () => [],
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const previous = this.transactionTail;
      let release!: () => void;
      this.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(this.prisma);
      } finally {
        release();
      }
    },
    nativeAuthSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `native-session-${this.nextId++}`;
        const now = new Date();
        const session: TestSession = {
          absoluteExpiresAt: data.absoluteExpiresAt as Date,
          appVersion: (data.appVersion as string | null) ?? null,
          createdAt: now,
          deviceId: data.deviceId as string,
          expiresAt: data.expiresAt as Date,
          id,
          lastUsedAt: now,
          platform: (data.platform as string | null) ?? null,
          previousRefreshTokenHash: null,
          refreshTokenHash: data.refreshTokenHash as string,
          revokeReason: null,
          revokedAt: null,
          revokedByUserId: null,
          rotatedAt: null,
          userId: data.userId as string,
        };
        this.sessions.set(id, session);
        const nested = data.refreshTokens as {
          create: { expiresAt: Date; tokenHash: string };
        };
        this.tokens.set(
          nested.create.tokenHash,
          this.newToken(id, nested.create.tokenHash, nested.create.expiresAt),
        );
        return session;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        [...this.sessions.values()]
          .filter(
            (session) =>
              session.userId === where.userId && session.revokedAt === null,
          )
          .map(({ id }) => ({ id })),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const session = this.sessions.get(where.id);
        if (!session) return null;
        const user = [...this.users.values()].find(
          (candidate) => candidate.id === session.userId,
        );
        return { ...session, user };
      },
      update: async ({ data, where }: UpdateArgs<TestSession>) => {
        const session = this.sessions.get(where.id)!;
        Object.assign(session, data);
        return session;
      },
      updateMany: async ({ data, where }: UpdateManyArgs<TestSession>) => {
        const matched = this.matchSessions(where);
        matched.forEach((session) => Object.assign(session, data));
        return { count: matched.length };
      },
    },
    nativeRefreshToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const token = this.newToken(
          data.sessionId as string,
          data.tokenHash as string,
          data.expiresAt as Date,
        );
        this.tokens.set(token.tokenHash, token);
        return token;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        this.tokens.get(where.tokenHash) ?? null,
      updateMany: async ({ data, where }: UpdateManyArgs<TestRefreshToken>) => {
        const matched = [...this.tokens.values()].filter((token) => {
          if (where.id && token.id !== where.id) return false;
          if (
            where.sessionId &&
            !matchesString(token.sessionId, where.sessionId)
          )
            return false;
          if (where.usedAt === null && token.usedAt !== null) return false;
          if (where.revokedAt === null && token.revokedAt !== null)
            return false;
          return true;
        });
        matched.forEach((token) => Object.assign(token, data));
        return { count: matched.length };
      },
    },
    user: {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
      }) =>
        where.email
          ? (this.users.get(where.email) ?? null)
          : ([...this.users.values()].find((user) => user.id === where.id) ??
            null),
      update: async ({ data, where }: UpdateArgs<TestUser>) => {
        const user = [...this.users.values()].find(
          (candidate) => candidate.id === where.id,
        )!;
        Object.assign(user, data);
        return user;
      },
    },
  };

  private newToken(
    sessionId: string,
    tokenHash: string,
    expiresAt: Date,
  ): TestRefreshToken {
    return {
      expiresAt,
      id: `refresh-${this.nextId++}`,
      issuedAt: new Date(),
      replacedByTokenHash: null,
      revokedAt: null,
      sessionId,
      tokenHash,
      usedAt: null,
    };
  }

  private matchSessions(where: Record<string, unknown>): TestSession[] {
    return [...this.sessions.values()].filter((session) => {
      if (where.id && !matchesString(session.id, where.id)) return false;
      if (where.userId && session.userId !== where.userId) return false;
      if (where.revokedAt === null && session.revokedAt !== null) return false;
      return true;
    });
  }
}

function matchesString(value: string, condition: unknown): boolean {
  if (typeof condition === 'string') return value === condition;
  return (
    condition !== null &&
    typeof condition === 'object' &&
    'in' in condition &&
    Array.isArray(condition.in) &&
    condition.in.includes(value)
  );
}

interface UpdateArgs<T> {
  data: Partial<T>;
  where: { id: string };
}

interface UpdateManyArgs<T> {
  data: Partial<T>;
  where: Record<string, unknown>;
}

function testUser(
  id: string,
  email: string,
  role: string,
  permissions: string[],
): TestUser {
  return {
    email,
    id,
    isActive: true,
    lastLoginAt: null,
    name: `${role} User`,
    passwordHash: PASSWORD_HASH,
    role,
    roleAssignments: [
      {
        role: {
          code: role,
          isActive: true,
          permissions: permissions.map((code) => ({ permission: { code } })),
        },
      },
    ],
  };
}
