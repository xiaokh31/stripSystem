import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  authHeaderFor,
  authTestUsers,
  configureAuthTestEnv,
  installAuthMock,
  type AuthTestUser,
} from './auth-test-helpers';
import {
  ContainerStatus,
  GeneratedFileType,
  LoadJobStatus,
  PalletStatus,
  ParseStatus,
} from './../src/generated/prisma/enums';

describe('DashboardController (e2e)', () => {
  let app: INestApplication<App>;
  let noPermissionUser: AuthTestUser;

  beforeEach(async () => {
    configureAuthTestEnv();
    noPermissionUser = {
      id: 'auth-no-dashboard-permissions',
      email: 'no-dashboard@example.com',
      name: 'No Dashboard Permissions',
      role: 'LIMITED',
      isActive: true,
      roleAssignments: [],
    };
    const prisma = createDashboardPrismaMock();
    installAuthMock(prisma, [
      ...Object.values(authTestUsers),
      noPermissionUser,
    ]);

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

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/operations')
      .expect(401);
  });

  it('returns all dashboard sections for ADMIN without localized labels', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/operations?range=7d&month=2026-07')
      .set('Authorization', authHeaderFor(authTestUsers.admin))
      .expect(200);

    expect(response.body).toMatchObject({
      range: '7d',
      month: '2026-07',
      health: {
        apiStatus: 'ok',
        databaseStatus: 'up',
      },
      inventory: {
        totalPallets: 6,
        loadedPallets: 1,
        remainingPallets: 3,
      },
      loadJobs: {
        openCount: 2,
        inProgressCount: 1,
      },
      monthlySummary: {
        completedContainerCount: 1,
        rowCount: 2,
        reviewWarningCount: 1,
      },
      wageAndAttendance: {
        attendanceImportsNeedingParse: 1,
        attendanceImportsWithErrors: 1,
        wageSettlementsNeedingReview: 1,
      },
    });
    expect(response.body.workQueue.items[0]).toMatchObject({
      code: 'IMPORTS_AWAITING_PARSE',
      labelKey: 'dashboard.workQueue.importsAwaitingParse',
    });
    expect(
      response.body.workQueue.items.every((item: { labelKey: string }) =>
        item.labelKey.startsWith('dashboard.'),
      ),
    ).toBe(true);
  });

  it('trims sections by role permissions', async () => {
    const warehouse = await request(app.getHttpServer())
      .get('/api/dashboard/operations?month=2026-07')
      .set('Authorization', authHeaderFor(authTestUsers.warehouse))
      .expect(200);

    expect(warehouse.body.inventory).not.toBeNull();
    expect(warehouse.body.loadJobs).not.toBeNull();
    expect(warehouse.body.monthlySummary).toBeNull();
    expect(warehouse.body.wageAndAttendance).toBeNull();
    expect(
      warehouse.body.hiddenSections.map(
        (section: { code: string }) => section.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        'monthlySummary',
        'wageAndAttendance.attendance',
        'wageAndAttendance.unloadingWage',
      ]),
    );

    const hr = await request(app.getHttpServer())
      .get('/api/dashboard/operations?month=2026-07')
      .set('Authorization', authHeaderFor(authTestUsers.hrManager))
      .expect(200);

    expect(hr.body.inventory).toBeNull();
    expect(hr.body.loadJobs).toBeNull();
    expect(hr.body.wageAndAttendance).toMatchObject({
      attendanceImportsNeedingParse: 1,
      attendanceImportsWithErrors: 1,
      wageSettlementsNeedingReview: null,
    });
  });

  it('returns hidden sections and no business data for users without dashboard permissions', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/operations?month=2026-07')
      .set('Authorization', authHeaderFor(noPermissionUser))
      .expect(200);

    expect(response.body.workQueue).toEqual({ totalActions: 0, items: [] });
    expect(response.body.containerLifecycle).toEqual({
      totalContainers: 0,
      stages: [],
    });
    expect(response.body.inventory).toBeNull();
    expect(response.body.loadJobs).toBeNull();
    expect(response.body.exceptionQueue).toEqual([]);
    expect(response.body.monthlySummary).toBeNull();
    expect(response.body.wageAndAttendance).toBeNull();
    expect(response.body.recentActivity).toEqual([]);
    expect(
      response.body.hiddenSections.map(
        (section: { code: string }) => section.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        'workQueue',
        'containerLifecycle',
        'inventory',
        'loadJobs',
        'exceptionQueue',
        'monthlySummary',
        'recentActivity',
      ]),
    );
  });
});

function createDashboardPrismaMock(): Record<string, unknown> {
  const now = new Date('2026-07-11T12:00:00.000Z');
  return {
    checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
    importFile: {
      count: jest.fn(async (args) =>
        args?.where?.parseStatus === ParseStatus.ERROR ? 1 : 2,
      ),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'import-1',
          originalFilename: 'manifest.xlsx',
          parseStatus: ParseStatus.NOT_PARSED,
          createdAt: now,
        },
      ]),
    },
    container: {
      count: jest.fn(async (args) => {
        if (args?.where?.status?.in) {
          return 1;
        }
        if (
          args?.where?.generatedFiles?.none?.fileType ===
          GeneratedFileType.EXCEL_REPORT
        ) {
          return 1;
        }
        if (
          args?.where?.generatedFiles?.none?.fileType ===
          GeneratedFileType.PALLET_LABEL_PDF
        ) {
          return 1;
        }
        return 4;
      }),
      groupBy: jest.fn().mockResolvedValue([
        { status: ContainerStatus.PARSED, _count: { _all: 1 } },
        { status: ContainerStatus.LABELS_GENERATED, _count: { _all: 1 } },
        { status: ContainerStatus.UNLOADED, _count: { _all: 1 } },
        { status: ContainerStatus.LOADED, _count: { _all: 1 } },
      ]),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'container-1',
          containerNo: 'CSNU8877228',
          status: ContainerStatus.LOADED,
          updatedAt: now,
        },
      ]),
    },
    containerDestination: {
      findMany: jest.fn().mockResolvedValue([
        {
          destinationCode: 'YYC',
          pallets: [
            { status: PalletStatus.LOADED },
            { status: PalletStatus.LABEL_PRINTED },
            { status: PalletStatus.PLANNED },
            { status: PalletStatus.ADJUSTED_OUT },
            { status: PalletStatus.CANCELLED },
          ],
        },
        {
          destinationCode: 'YVR',
          pallets: [{ status: PalletStatus.PLANNED }],
        },
      ]),
    },
    loadJob: {
      count: jest.fn(async (args) => {
        if (args?.where?.status === LoadJobStatus.PLANNED) {
          return 2;
        }
        if (args?.where?.status === LoadJobStatus.IN_PROGRESS) {
          return 1;
        }
        if (args?.where?.scheduledDepartureAt) {
          return 1;
        }
        return 3;
      }),
      findMany: jest.fn(async (args) => {
        if (args?.include?.lines) {
          return [
            {
              id: 'load-job-1',
              jobNo: 'LOAD-001',
              truckNo: 'TRK-1',
              dockNo: 'D1',
              status: LoadJobStatus.IN_PROGRESS,
              scheduledDepartureAt: now,
              lines: [{ plannedPallets: 3, externalTransfer: false }],
              pallets: [{ status: PalletStatus.LOADED }],
            },
          ];
        }
        return [
          {
            id: 'load-job-1',
            jobNo: 'LOAD-001',
            status: LoadJobStatus.IN_PROGRESS,
            updatedAt: now,
          },
        ];
      }),
    },
    containerLine: {
      count: jest.fn(async (args) => (args?.where?.volume === 0 ? 1 : 2)),
    },
    generatedFile: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
    },
    wageGeneratedFile: {
      count: jest.fn().mockResolvedValue(1),
    },
    palletEvent: {
      count: jest.fn().mockResolvedValue(2),
    },
    asyncJob: {
      count: jest.fn().mockResolvedValue(1),
    },
    payContainer: {
      findFirst: jest.fn().mockResolvedValue({ completedAt: now }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'pay-container-1',
          completedAt: now,
          status: 'COMPLETED',
          sourceContainers: [
            {
              container: {
                id: 'container-1',
                status: ContainerStatus.LOADED,
                destinations: [{}, {}],
              },
            },
          ],
        },
      ]),
    },
    attendanceImport: {
      count: jest.fn().mockResolvedValue(1),
    },
    unloadingWageSettlement: {
      count: jest.fn().mockResolvedValue(1),
    },
    correctionFeedback: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}
