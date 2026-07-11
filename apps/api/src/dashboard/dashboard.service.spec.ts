import { ConfigService } from '@nestjs/config';
import { DashboardService } from './dashboard.service';
import { ROLE_CODES } from '../auth/permissions';
import { AuthenticatedUser } from '../auth/auth-user';
import {
  ContainerStatus,
  GeneratedFileStatus,
  GeneratedFileType,
  LoadJobStatus,
  PalletStatus,
  ParseStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  it('builds the operations dashboard from database-backed records', async () => {
    const service = new DashboardService(
      createDashboardPrismaMock() as unknown as PrismaService,
      configService(),
    );

    const dashboard = await service.operations({ range: 'today' }, adminUser());

    expect(dashboard.month).toBe('2026-07');
    expect(dashboard.health).toEqual({
      apiStatus: 'ok',
      databaseStatus: 'up',
      version: '0.0.1-test',
    });
    expect(dashboard.workQueue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'IMPORTS_AWAITING_PARSE',
          count: 2,
          labelKey: 'dashboard.workQueue.importsAwaitingParse',
        }),
        expect.objectContaining({
          code: 'UNLOADING_COMPLETION_DATE_MISSING',
          count: 1,
        }),
      ]),
    );
    expect(dashboard.inventory).toMatchObject({
      totalPallets: 6,
      loadedPallets: 1,
      remainingPallets: 3,
      topDestinations: [
        {
          destinationCode: 'YYC',
          totalPallets: 5,
          loadedPallets: 1,
          remainingPallets: 2,
        },
        {
          destinationCode: 'YVR',
          totalPallets: 1,
          loadedPallets: 0,
          remainingPallets: 1,
        },
      ],
    });
    expect(dashboard.loadJobs).toMatchObject({
      openCount: 2,
      inProgressCount: 1,
      activeJobs: [
        {
          id: 'load-job-1',
          loadNumber: 'LOAD-001',
          totalPallets: 3,
          loadedPallets: 1,
          remainingPallets: 2,
        },
      ],
    });
    expect(dashboard.monthlySummary).toMatchObject({
      completedContainerCount: 1,
      rowCount: 2,
      reviewWarningCount: 1,
    });
    expect(dashboard.wageAndAttendance).toMatchObject({
      attendanceImportsNeedingParse: 1,
      attendanceImportsWithErrors: 1,
      wageSettlementsNeedingReview: 1,
    });
  });

  it('hides unauthorized sections without leaking business data', async () => {
    const service = new DashboardService(
      createDashboardPrismaMock() as unknown as PrismaService,
      configService(),
    );

    const dashboard = await service.operations(
      { range: 'today', month: '2026-07' },
      limitedUser(),
    );

    expect(dashboard.inventory).toBeNull();
    expect(dashboard.loadJobs).toBeNull();
    expect(dashboard.monthlySummary).toBeNull();
    expect(dashboard.wageAndAttendance).toBeNull();
    expect(dashboard.containerLifecycle).toEqual({
      totalContainers: 0,
      stages: [],
    });
    expect(dashboard.workQueue).toEqual({ totalActions: 0, items: [] });
    expect(dashboard.hiddenSections.map((section) => section.code)).toEqual(
      expect.arrayContaining([
        'workQueue',
        'containerLifecycle',
        'inventory',
        'loadJobs',
        'monthlySummary',
        'wageAndAttendance.attendance',
        'wageAndAttendance.unloadingWage',
      ]),
    );
  });

  it('returns stable label keys and raw labels instead of localized UI text', async () => {
    const service = new DashboardService(
      createDashboardPrismaMock() as unknown as PrismaService,
      configService(),
    );
    const dashboard = await service.operations({ range: '7d' }, adminUser());
    const labelKeys = [
      ...dashboard.workQueue.items.map((item) => item.labelKey),
      ...dashboard.containerLifecycle.stages.map((stage) => stage.labelKey),
      ...dashboard.exceptionQueue.map((item) => item.labelKey),
    ];

    expect(labelKeys.length).toBeGreaterThan(0);
    expect(labelKeys.every((key) => key.startsWith('dashboard.'))).toBe(true);
    expect(labelKeys.every((key) => !/\s/.test(key))).toBe(true);
    expect(
      dashboard.recentActivity.map((item) => ({
        kind: item.kind,
        label: item.label,
      })),
    ).toEqual(
      expect.arrayContaining([
        { kind: 'IMPORT', label: 'manifest.xlsx' },
        { kind: 'CONTAINER', label: 'CSNU8877228' },
        { kind: 'LOAD_JOB', label: 'LOAD-001' },
      ]),
    );
  });
});

function adminUser(): AuthenticatedUser {
  return {
    id: 'admin',
    email: 'admin@example.com',
    name: 'Admin',
    roles: [ROLE_CODES.admin],
    permissions: [],
  };
}

function limitedUser(): AuthenticatedUser {
  return {
    id: 'limited',
    email: 'limited@example.com',
    name: 'Limited',
    roles: ['LIMITED'],
    permissions: [],
  };
}

function configService(): ConfigService {
  return {
    get: (key: string) => (key === 'app.version' ? '0.0.1-test' : undefined),
  } as unknown as ConfigService;
}

function createDashboardPrismaMock(): Record<string, unknown> {
  const now = new Date('2026-07-11T12:00:00.000Z');
  return {
    checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
    importFile: {
      count: jest.fn(async (args) => {
        if (args?.where?.parseStatus === ParseStatus.ERROR) {
          return 1;
        }
        if (args?.where?.parseStatus === ParseStatus.NOT_PARSED) {
          return 2;
        }
        return 0;
      }),
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
              lines: [
                { plannedPallets: 3, externalTransfer: false },
                { plannedPallets: 2, externalTransfer: true },
              ],
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
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'generated-1',
          importFileId: 'import-1',
          containerId: null,
          fileType: GeneratedFileType.EXCEL_REPORT,
          status: GeneratedFileStatus.GENERATED,
          updatedAt: now,
        },
      ]),
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
      count: jest.fn(async (args) =>
        args?.where?.parseStatus === ParseStatus.ERROR ? 1 : 1,
      ),
    },
    unloadingWageSettlement: {
      count: jest.fn().mockResolvedValue(1),
    },
    correctionFeedback: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'correction-1',
          targetType: 'CONTAINER_DESTINATION',
          importFileId: null,
          containerId: 'container-1',
          generatedFileId: null,
          fieldName: 'manualPallets',
          createdAt: now,
        },
      ]),
    },
  };
}
