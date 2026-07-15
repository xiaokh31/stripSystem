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

describe('Inventory pagination API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: { $queryRaw: jest.Mock };
  const inventoryReader = permissionUser(
    'inventory-pagination-reader',
    PERMISSIONS.inventory.read,
  );
  const containersOnlyReader = permissionUser(
    'containers-only-reader',
    PERMISSIONS.containers.read,
  );

  beforeEach(async () => {
    configureAuthTestEnv();
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue(
        Array.from({ length: 23 }, (_, index) =>
          row(
            `container-${String(index + 1).padStart(2, '0')}`,
            `WEBOPS08-${index + 1}`,
            index % 3 === 0 ? 'PARSED' : 'LABELS_GENERATED',
            new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
          ),
        ),
      ),
    };
    installAuthMock(prisma, [inventoryReader, containersOnlyReader]);

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

  it.each([5, 10, 20, 50])(
    'returns stable metadata and global totals for page size %i',
    async (pageSize) => {
      const response = await request(app.getHttpServer())
        .get(`/api/reports/container-summary?page=1&pageSize=${pageSize}`)
        .set('Authorization', authHeaderFor(inventoryReader))
        .expect(200);

      expect(response.body).toMatchObject({
        page: 1,
        pageSize,
        totalItems: 23,
        totalPages: Math.ceil(23 / pageSize),
        totals: {
          activeTotalPallets: 46,
          remainingPallets: 46,
          totalPallets: 46,
        },
      });
      expect(response.body.items).toHaveLength(Math.min(23, pageSize));
    },
  );

  it('normalizes page overflow and preserves the same selected-independent contract', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/reports/container-summary?page=999&pageSize=10&sortBy=createdAt&sortDirection=desc',
      )
      .set('Authorization', authHeaderFor(inventoryReader))
      .expect(200);

    expect(response.body).toMatchObject({
      page: 3,
      pageSize: 10,
      totalItems: 23,
      totalPages: 3,
    });
    expect(response.body.items).toHaveLength(3);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['createdAt', 'asc', 'container-01'],
    ['createdAt', 'desc', 'container-23'],
    ['containerNo', 'asc', 'container-01'],
    ['containerNo', 'desc', 'container-23'],
    ['status', 'asc', 'container-01'],
    ['status', 'desc', 'container-23'],
  ])('exposes the shared %s %s ordering', async (sortBy, direction, firstId) => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/reports/container-summary?pageSize=5&sortBy=${sortBy}&sortDirection=${direction}`,
      )
      .set('Authorization', authHeaderFor(inventoryReader))
      .expect(200);
    expect(response.body.items[0].containerId).toBe(firstId);
  });

  it('rejects invalid pagination, sort values, extra keys, and callers without inventory.read', async () => {
    for (const url of [
      '/api/reports/container-summary?page=0',
      '/api/reports/container-summary?pageSize=25',
      '/api/reports/container-summary?sortBy=updatedAt',
      '/api/reports/container-summary?sortDirection=sideways',
      '/api/reports/container-summary?unknown=value',
    ]) {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', authHeaderFor(inventoryReader))
        .expect(400);
    }
    await request(app.getHttpServer())
      .get('/api/reports/container-summary')
      .set('Authorization', authHeaderFor(containersOnlyReader))
      .expect(403);
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
) {
  return {
    activeTotalPallets: 2,
    adjustedOutPallets: 0,
    cancelledPallets: 0,
    containerId,
    containerNo,
    createdAt: new Date(createdAt),
    effectiveLoadedPallets: 0,
    hasLoadingSignal: false,
    lifecycleActivePallets: 2,
    loadedPallets: 0,
    payClassification: null,
    payTrailerNumber: null,
    remainingPallets: 2,
    storedStatus,
    totalPallets: 2,
  };
}
