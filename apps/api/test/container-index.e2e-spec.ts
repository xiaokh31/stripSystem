import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PERMISSIONS, ROLE_CODES } from './../src/auth/permissions';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  AuthTestUser,
  authHeaderFor,
  configureAuthTestEnv,
  installAuthMock,
} from './auth-test-helpers';

describe('Container index API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: { $queryRaw: jest.Mock };
  const containersReader = permissionUser(
    'containers-index-reader',
    PERMISSIONS.containers.read,
  );
  const inventoryReader = permissionUser(
    'inventory-only-reader',
    PERMISSIONS.inventory.read,
  );

  beforeEach(async () => {
    configureAuthTestEnv();
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        row('empty', 'Z9', 'IMPORTED', '2026-01-01T08:00:00.000Z'),
        row('loaded', 'a10', 'UNLOADED', '2026-03-01T08:00:00.000Z', {
          activeTotalPallets: 2,
          effectiveLoadedPallets: 2,
          loadedPallets: 2,
          totalPallets: 2,
        }),
        row('loading', 'A2', 'LABELS_GENERATED', '2026-02-01T08:00:00.000Z', {
          activeTotalPallets: 2,
          hasLoadingSignal: true,
          remainingPallets: 2,
          totalPallets: 2,
        }),
      ]),
    };
    installAuthMock(prisma, [containersReader, inventoryReader]);

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

  afterEach(async () => {
    await app.close();
  });

  it('returns all containers, ISO createdAt, backend counts, effective status, and all six stable orders from one query each', async () => {
    const cases = [
      ['createdAt', 'asc', ['empty', 'loading', 'loaded']],
      ['createdAt', 'desc', ['loaded', 'loading', 'empty']],
      ['containerNo', 'asc', ['loading', 'loaded', 'empty']],
      ['containerNo', 'desc', ['empty', 'loaded', 'loading']],
      ['status', 'asc', ['empty', 'loading', 'loaded']],
      ['status', 'desc', ['loaded', 'loading', 'empty']],
    ] as const;

    for (const [sort, direction, expectedIds] of cases) {
      const response = await request(app.getHttpServer())
        .get(`/api/containers?sort=${sort}&direction=${direction}`)
        .set('Authorization', authHeaderFor(containersReader))
        .expect(200);
      expect(
        response.body.items.map(
          (item: { containerId: string }) => item.containerId,
        ),
      ).toEqual(expectedIds);
    }

    const defaultResponse = await request(app.getHttpServer())
      .get('/api/containers')
      .set('Authorization', authHeaderFor(containersReader))
      .expect(200);
    expect(defaultResponse.body.items).toEqual([
      expect.objectContaining({
        containerId: 'loaded',
        createdAt: '2026-03-01T08:00:00.000Z',
        loadedPallets: 2,
        status: 'LOADED',
      }),
      expect.objectContaining({
        containerId: 'loading',
        status: 'LOADING_IN_PROGRESS',
      }),
      expect.objectContaining({
        activeTotalPallets: 0,
        containerId: 'empty',
        status: 'IMPORTED',
        totalPallets: 0,
      }),
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(7);
  });

  it('requires containers.read independently from inventory.read', async () => {
    await request(app.getHttpServer())
      .get('/api/containers')
      .set('Authorization', authHeaderFor(containersReader))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/containers')
      .set('Authorization', authHeaderFor(inventoryReader))
      .expect(403);
  });

  it('fully reverses same-status tie-breaks', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('tie-a', 'A2', 'PARSED', '2026-02-01T08:00:00.000Z'),
      row('tie-b', 'A10', 'PARSED', '2026-02-01T08:00:00.000Z'),
    ]);
    const authorization = authHeaderFor(containersReader);

    const ascending = await request(app.getHttpServer())
      .get('/api/containers?sort=status&direction=asc')
      .set('Authorization', authorization)
      .expect(200);
    const descending = await request(app.getHttpServer())
      .get('/api/containers?sort=status&direction=desc')
      .set('Authorization', authorization)
      .expect(200);

    expect(
      ascending.body.items.map(
        (item: { containerId: string }) => item.containerId,
      ),
    ).toEqual(['tie-a', 'tie-b']);
    expect(
      descending.body.items.map(
        (item: { containerId: string }) => item.containerId,
      ),
    ).toEqual(['tie-b', 'tie-a']);
  });

  it('rejects unknown sort values, directions, extra query keys, and overlong searches', async () => {
    const authorization = authHeaderFor(containersReader);
    for (const url of [
      '/api/containers?sort=updatedAt',
      '/api/containers?direction=sideways',
      '/api/containers?sort=createdAt%20desc',
      '/api/containers?unknown=value',
      `/api/containers?containerNo=${'A'.repeat(65)}`,
    ]) {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', authorization)
        .expect(400);
    }
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

function permissionUser(id: string, permission: string): AuthTestUser {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    role: ROLE_CODES.office,
    isActive: true,
    roleAssignments: [
      {
        role: {
          code: `${id.toUpperCase()}_ROLE`,
          isActive: true,
          permissions: [{ permission: { code: permission } }],
        },
      },
    ],
  };
}

function row(
  containerId: string,
  containerNo: string,
  storedStatus: string,
  createdAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    activeTotalPallets: 0,
    adjustedOutPallets: 0,
    cancelledPallets: 0,
    containerId,
    containerNo,
    createdAt: new Date(createdAt),
    effectiveLoadedPallets: 0,
    hasLoadingSignal: false,
    loadedPallets: 0,
    remainingPallets: 0,
    storedStatus,
    totalPallets: 0,
    ...overrides,
  };
}
