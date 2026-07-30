import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { ReportsService } from './reports.service';
import {
  WorkerReportPayload,
  WorkerReportRequest,
  WorkerReportService,
} from './worker-report.service';
import { PrismaService } from '../prisma/prisma.service';

interface ContainerDestinationRecord {
  id: string;
  destinationCode: string;
  destinationType: string;
  packageType?: string | null;
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number;
  finalPallets: number;
  palletRuleCode?: string | null;
  calculationBasisCbm?: string | null;
  roundingMode?: string | null;
  pallets?: Array<{
    status: string;
    loadJobId: string | null;
    loadedAt: Date | null;
  }>;
}

interface ContainerRecord {
  id: string;
  importFileId: string | null;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string;
  company: string;
  status: string;
  destinations: ContainerDestinationRecord[];
}

interface ContainerUpdateArgs {
  where: { id: string };
  data: { status: string };
}

interface GeneratedFileData {
  importFileId: string | null;
  containerId: string;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string;
  fileSizeBytes: bigint | null;
  status: string;
  errorMessage: string | null;
  generatedById: string;
}

interface GeneratedFileCreateArgs {
  data: GeneratedFileData;
}

interface GeneratedFileFindFirstArgs {
  orderBy?: { updatedAt: string };
  where: { containerId: string; fileType?: string; id?: string };
}

interface GeneratedFileUpdateArgs {
  where: { id: string };
  data: GeneratedFileData;
}

interface GeneratedFileRecord extends GeneratedFileData {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ReportsPrismaMock {
  $transaction: jest.Mock<
    Promise<GeneratedFileRecord>,
    [(tx: ReportsPrismaMock) => Promise<GeneratedFileRecord>]
  >;
  container: {
    findUnique: jest.Mock<Promise<ContainerRecord>, []>;
    update: jest.Mock<
      Promise<{ id: string; status: string }>,
      [ContainerUpdateArgs]
    >;
  };
  generatedFile: {
    create: jest.Mock<Promise<GeneratedFileRecord>, [GeneratedFileCreateArgs]>;
    findFirst: jest.Mock<
      Promise<GeneratedFileRecord | null>,
      [GeneratedFileFindFirstArgs]
    >;
    update: jest.Mock<Promise<GeneratedFileRecord>, [GeneratedFileUpdateArgs]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [any]>;
    findMany: jest.Mock<Promise<GeneratedFileRecord[]>, [any?]>;
  };
  generatedFileReplacement: {
    createMany: jest.Mock<Promise<{ count: number }>, [any]>;
  };
}

interface WorkerReportMock {
  writeReport: jest.Mock<
    Promise<WorkerReportPayload>,
    [WorkerReportRequest, string]
  >;
}

interface PalletReportPlan {
  destinationCode: string;
  packageType?: string | null;
  ruleCode?: string | null;
  calculationBasisCbm?: number | null;
  roundingMode?: string | null;
  calculatedPallets: number;
  manualPallets: number;
  finalPallets: number;
}

interface PalletReportPayload {
  plans: PalletReportPlan[];
  totalFinalPallets: number;
}

describe('ReportsService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['reports.generate'],
  };
  let storageRoot: string;
  let outputPath: string;
  let prisma: ReportsPrismaMock;
  let workerReport: WorkerReportMock;
  let service: ReportsService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'p1-06-reports-service-'));
    prisma = createPrismaMock();
    const writeReport = jest.fn<
      Promise<WorkerReportPayload>,
      [WorkerReportRequest, string]
    >();
    writeReport.mockImplementation(async (_request, reportDir) => {
      outputPath = join(reportDir, 'CSNU8877228卸柜报告-En.xlsx');
      await mkdir(reportDir, { recursive: true });
      await writeFile(outputPath, 'xlsx bytes');
      return {
        task_status: 'SUCCESS',
        report_result: {
          outputPath,
          writtenDestinationCount: 1,
          totalDestinationCount: 1,
          orderedDestinationDigest: 'a'.repeat(64),
          layoutModes: ['PRIMARY_ONLY'],
          pageEvidence: [
            {
              page: 1,
              layoutMode: 'PRIMARY_ONLY',
              expectedDestinationCount: 1,
              writtenDestinationCount: 1,
              expectedPhysicalRows: [4],
              writtenPhysicalRows: [4],
            },
          ],
          warnings: [],
          errors: [],
        },
        warnings: [],
        errors: [],
      };
    });
    workerReport = {
      writeReport,
    };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      workerReport as unknown as WorkerReportService,
      {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'app.storageRoot') {
            return storageRoot;
          }
          throw new Error(`Unexpected config key ${key}`);
        }),
      } as unknown as ConfigService,
    );
  });

  it('uses corrected finalPallets and records a generated Excel report', async () => {
    const result = await service.generateReport('container-1', officeActor);

    expect(workerReport.writeReport).toHaveBeenCalledTimes(1);
    const [request, reportDir] = workerReport.writeReport.mock.calls[0];
    const palletResult =
      request.pallet_result as unknown as PalletReportPayload;
    expect(reportDir).toContain(
      join(storageRoot, 'reports', 'CSNU8877228'),
    );
    expect(request.parsed_result).toMatchObject({
      destinationSummaries: [
        expect.objectContaining({
          destinationCode: 'YYZ',
          packageType: 'CARTON',
        }),
      ],
    });
    expect(palletResult.totalFinalPallets).toBe(7);
    expect(palletResult.plans[0]).toMatchObject({
      destinationCode: 'YYZ',
      packageType: 'CARTON',
      ruleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: 1.8,
      roundingMode: 'CEIL',
      calculatedPallets: 4,
      manualPallets: 7,
      finalPallets: 7,
    });
    expect(result.generatedFile).toMatchObject({
      containerId: 'container-1',
      fileType: 'EXCEL_REPORT',
      filename: 'CSNU8877228卸柜报告-En.xlsx',
      status: 'GENERATED',
    });
    expect(result.reportEvidence).toEqual({
      expectedDestinationCount: 1,
      writtenDestinationCount: 1,
      orderedDestinationDigest: 'a'.repeat(64),
      layoutModes: ['PRIMARY_ONLY'],
      pageEvidence: [
        {
          page: 1,
          layoutMode: 'PRIMARY_ONLY',
          expectedDestinationCount: 1,
          writtenDestinationCount: 1,
          expectedPhysicalRows: [4],
          writtenPhysicalRows: [4],
        },
      ],
    });
    const generatedFileCreate = prisma.generatedFile.create.mock.calls[0][0];
    expect(generatedFileCreate.data.fileType).toBe('EXCEL_REPORT');
    expect(generatedFileCreate.data.status).toBe('GENERATED');
    expect(generatedFileCreate.data.storagePath).toBe(outputPath);
    expect(typeof generatedFileCreate.data.fileSha256).toBe('string');
    expect(generatedFileCreate.data.generatedById).toBe('auth-office');
    expect(prisma.container.update).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      data: { status: 'REPORT_GENERATED' },
    });
  });

  it('generates an Excel report for a manual container without an import file', async () => {
    const manualContainer = defaultContainerRecord();
    manualContainer.id = 'container-manual';
    manualContainer.importFileId = null;
    manualContainer.containerNo = 'MANU1234567';
    manualContainer.sourceFormat = 'UNKNOWN';
    manualContainer.parserVersion = 'manual-entry-v1';
    manualContainer.company = 'Manual Customer';
    manualContainer.destinations = [
      {
        id: 'destination-manual-1',
        destinationCode: 'YEG1',
        destinationType: 'WAREHOUSE',
        cartons: 36,
        volume: '0.000',
        calculatedPallets: 0,
        manualPallets: 4,
        finalPallets: 4,
      },
    ];
    prisma.container.findUnique.mockResolvedValueOnce(manualContainer);

    const result = await service.generateReport(
      'container-manual',
      officeActor,
    );

    const [request] = workerReport.writeReport.mock.calls[0];
    const palletResult =
      request.pallet_result as unknown as PalletReportPayload;
    expect(request.company).toBe('Manual Customer');
    expect(request.parsed_result).toMatchObject({
      containerNo: 'MANU1234567',
      formatType: 'UNKNOWN',
      parserVersion: 'manual-entry-v1',
    });
    expect(palletResult.plans[0]).toMatchObject({
      destinationCode: 'YEG1',
      calculatedPallets: 0,
      manualPallets: 4,
      finalPallets: 4,
    });
    expect(result.generatedFile.importFileId).toBeNull();
  });

  it('downloads a generated file for the owning container', async () => {
    const generated = await service.generateReport('container-1', officeActor);
    const download = await service.downloadFile(
      'container-1',
      generated.generatedFile.id,
    );

    expect(download).toMatchObject({
      filename: 'CSNU8877228卸柜报告-En.xlsx',
      fileSizeBytes: 10,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(download.buffer.toString()).toBe('xlsx bytes');
    expect(prisma.generatedFile.findFirst).toHaveBeenCalledWith({
      where: { id: generated.generatedFile.id, containerId: 'container-1' },
    });
  });

  it('downloads legacy generated file records stored with a host storage path', async () => {
    const legacyPath =
      '/Volumes/xfl/logistics/stripSystem/storage/reports/CSNU8877228卸柜报告-En.xlsx';
    await mkdir(join(storageRoot, 'reports'), { recursive: true });
    await writeFile(
      join(storageRoot, 'reports', 'CSNU8877228卸柜报告-En.xlsx'),
      'xlsx bytes',
    );
    const generated = await service.generateReport('container-1', officeActor);
    prisma.generatedFile.findFirst.mockResolvedValueOnce({
      id: generated.generatedFile.id,
      importFileId: generated.generatedFile.importFileId,
      containerId: generated.generatedFile.containerId ?? 'container-1',
      fileType: generated.generatedFile.fileType,
      storagePath: legacyPath,
      fileSha256: generated.generatedFile.fileSha256,
      fileSizeBytes: BigInt(10),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      status: generated.generatedFile.status,
      errorMessage: null,
      generatedById: 'auth-office',
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
    });

    const download = await service.downloadFile(
      'container-1',
      generated.generatedFile.id,
    );

    expect(download).toMatchObject({
      filename: 'CSNU8877228卸柜报告-En.xlsx',
      fileSizeBytes: 10,
    });
    expect(download.buffer.toString()).toBe('xlsx bytes');
  });

  it('records a failed generated_file when the worker reports an error', async () => {
    workerReport.writeReport.mockResolvedValueOnce({
      task_status: 'ERROR',
      report_result: null,
      warnings: [],
      errors: [
        {
          code: 'REPORT_TEMPLATE_ERROR',
          message: 'Report template could not be opened',
        },
      ],
    });

    await expect(
      service.generateReport('container-1', officeActor),
    ).rejects.toHaveProperty('response.code', 'REPORT_TEMPLATE_ERROR');

    const failedFileCreate = prisma.generatedFile.create.mock.calls[0][0];
    expect(failedFileCreate.data.fileType).toBe('EXCEL_REPORT');
    expect(failedFileCreate.data.status).toBe('FAILED');
    expect(failedFileCreate.data.storagePath).toContain(
      join(storageRoot, 'reports', 'CSNU8877228'),
    );
    expect(failedFileCreate.data.storagePath).toMatch(
      /CSNU8877228卸柜报告-En\.xlsx$/,
    );
    expect(failedFileCreate.data.fileSha256).toBeNull();
    expect(failedFileCreate.data.errorMessage).toBe('REPORT_TEMPLATE_ERROR');
    expect(prisma.container.update).not.toHaveBeenCalled();
  });

  it('allows report regeneration after loading has started without changing pallets', async () => {
    prisma.container.findUnique.mockResolvedValueOnce({
      ...defaultContainerRecord(),
      status: 'LABELS_GENERATED',
      destinations: [
        {
          ...defaultContainerRecord().destinations[0],
          pallets: [
            {
              status: 'LOADED',
              loadJobId: 'load-job-1',
              loadedAt: new Date('2026-06-27T10:00:00.000Z'),
            },
          ],
        },
      ],
    });

    const result = await service.generateReport('container-1', officeActor);

    expect(result.generatedFile).toMatchObject({
      containerId: 'container-1',
      fileType: 'EXCEL_REPORT',
      status: 'GENERATED',
    });
    expect(workerReport.writeReport).toHaveBeenCalledTimes(1);
    expect(prisma.container.update).not.toHaveBeenCalled();
  });

  it('supersedes the previous current report while retaining immutable history', async () => {
    const first = await service.generateReport('container-1', officeActor);
    const second = await service.generateReport('container-1', officeActor);

    expect(second.generatedFile.id).not.toBe(first.generatedFile.id);
    expect(
      prisma.generatedFile.create.mock.calls[1][0].data.storagePath,
    ).not.toBe(
      prisma.generatedFile.create.mock.calls[0][0].data.storagePath,
    );
    expect(prisma.generatedFile.create).toHaveBeenCalledTimes(2);
    expect(prisma.generatedFile.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [first.generatedFile.id] } },
      data: { status: 'SUPERSEDED' },
    });
    expect(prisma.generatedFileReplacement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          containerId: 'container-1',
          fileType: 'EXCEL_REPORT',
          oldGeneratedFileId: first.generatedFile.id,
          newGeneratedFileId: second.generatedFile.id,
          replacedById: 'auth-office',
          reasonCode: 'SUCCESSFUL_REGENERATION',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('resolves a superseded selected report to the current slot', async () => {
    const first = await service.generateReport('container-1', officeActor);
    const second = await service.generateReport('container-1', officeActor);

    const response = await service.listFiles(
      'container-1',
      first.generatedFile.id,
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        id: second.generatedFile.id,
        fileType: 'EXCEL_REPORT',
        status: 'GENERATED',
      }),
    ]);
    expect(response.items[0]).not.toHaveProperty('storagePath');
    expect(response.items[0]).not.toHaveProperty('errorMessage');
    expect(response.selection).toEqual({
      fileType: 'EXCEL_REPORT',
      requestedFileId: first.generatedFile.id,
      resolvedFileId: second.generatedFile.id,
      status: 'SUPERSEDED_REPLACED',
    });
  });

  it('keeps the prior successful report downloadable after conservation failure', async () => {
    const successful = await service.generateReport('container-1', officeActor);
    const oldSha = successful.generatedFile.fileSha256;
    const oldPath =
      prisma.generatedFile.create.mock.calls[0][0].data.storagePath;
    workerReport.writeReport.mockResolvedValueOnce({
      task_status: 'ERROR',
      report_result: {
        outputPath: join(
          storageRoot,
          'reports',
          'CSNU8877228',
          'failed-attempt',
          'CSNU8877228卸柜报告-En.xlsx',
        ),
        writtenDestinationCount: 0,
        totalDestinationCount: 1,
        orderedDestinationDigest: 'b'.repeat(64),
        errors: [
          {
            code: 'REPORT_DESTINATION_CONSERVATION_FAILED',
            message: 'REPORT_DESTINATION_CONSERVATION_FAILED',
            stage: 'reopen.row',
            expectedCount: 1,
            actualCount: 0,
            ordinal: 1,
          },
        ],
      },
      warnings: [],
      errors: [
        {
          code: 'REPORT_DESTINATION_CONSERVATION_FAILED',
          message: 'REPORT_DESTINATION_CONSERVATION_FAILED',
          stage: 'reopen.row',
          expectedCount: 1,
          actualCount: 0,
          ordinal: 1,
        },
      ],
    });

    await expect(
      service.generateReport('container-1', officeActor),
    ).rejects.toMatchObject({
      response: {
        code: 'REPORT_DESTINATION_CONSERVATION_FAILED',
        details: {
          stage: 'reopen.row',
          expectedCount: 1,
          actualCount: 0,
          ordinal: 1,
        },
      },
    });

    const download = await service.downloadFile(
      'container-1',
      successful.generatedFile.id,
    );
    expect(download.buffer.toString()).toBe('xlsx bytes');
    expect(successful.generatedFile.fileSha256).toBe(oldSha);
    expect(
      prisma.generatedFile.create.mock.calls[0][0].data.storagePath,
    ).toBe(oldPath);
    expect(prisma.generatedFile.update).not.toHaveBeenCalled();
    expect(prisma.generatedFile.create).toHaveBeenCalledTimes(2);
  });

  it('fails closed when adaptive layout evidence has the wrong physical rows', async () => {
    workerReport.writeReport.mockImplementationOnce(
      async (_request, reportDir) => {
        const invalidOutput = join(
          reportDir,
          'CSNU8877228卸柜报告-En.xlsx',
        );
        await mkdir(reportDir, { recursive: true });
        await writeFile(invalidOutput, 'invalid layout evidence');
        return {
          task_status: 'SUCCESS',
          report_result: {
            outputPath: invalidOutput,
            writtenDestinationCount: 1,
            totalDestinationCount: 1,
            orderedDestinationDigest: 'c'.repeat(64),
            layoutModes: ['PRIMARY_ONLY'],
            pageEvidence: [
              {
                page: 1,
                layoutMode: 'PRIMARY_ONLY',
                expectedDestinationCount: 1,
                writtenDestinationCount: 1,
                expectedPhysicalRows: [5],
                writtenPhysicalRows: [5],
              },
            ],
            warnings: [],
            errors: [],
          },
          warnings: [],
          errors: [],
        };
      },
    );

    await expect(
      service.generateReport('container-1', officeActor),
    ).rejects.toMatchObject({
      response: {
        code: 'REPORT_DESTINATION_CONSERVATION_FAILED',
        details: {
          stage: 'api.worker-evidence',
          expectedCount: 1,
          actualCount: 0,
        },
      },
    });
    expect(prisma.container.update).not.toHaveBeenCalled();
    expect(prisma.generatedFile.create).toHaveBeenCalledTimes(1);
    expect(prisma.generatedFile.create.mock.calls[0][0].data.status).toBe(
      'FAILED',
    );
  });

  function defaultContainerRecord(): ContainerRecord {
    return {
      id: 'container-1',
      importFileId: 'import-1',
      containerNo: 'CSNU8877228',
      sourceFormat: 'UNLOADING_PLAN_CN',
      parserVersion: 'unloading-plan-cn-v1',
      company: 'Bestar',
      status: 'CORRECTED',
      destinations: [
        {
          id: 'destination-1',
          destinationCode: 'YYZ',
          destinationType: 'AMAZON_FBA',
          packageType: 'CARTON',
          cartons: 40,
          volume: '5.250',
          calculatedPallets: 4,
          manualPallets: 7,
          finalPallets: 7,
          palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
          calculationBasisCbm: '1.800',
          roundingMode: 'CEIL',
          pallets: [],
        },
      ],
    };
  }

  function createPrismaMock(): ReportsPrismaMock {
    const generatedFiles: GeneratedFileRecord[] = [];
    const mock = {} as ReportsPrismaMock;

    mock.$transaction = jest.fn<
      Promise<GeneratedFileRecord>,
      [(tx: ReportsPrismaMock) => Promise<GeneratedFileRecord>]
    >((callback) => callback(mock));
    mock.container = {
      findUnique: jest
        .fn<Promise<ContainerRecord>, []>()
        .mockResolvedValue(defaultContainerRecord()),
      update: jest
        .fn<Promise<{ id: string; status: string }>, [ContainerUpdateArgs]>()
        .mockResolvedValue({
          id: 'container-1',
          status: 'REPORT_GENERATED',
        }),
    };
    mock.generatedFile = {
      create: jest.fn<Promise<GeneratedFileRecord>, [GeneratedFileCreateArgs]>(
        ({ data }) => {
          const now = new Date('2026-06-26T00:00:00.000Z');
          const record: GeneratedFileRecord = {
            id: `generated-file-${generatedFiles.length + 1}`,
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          generatedFiles.push(record);
          return Promise.resolve(record);
        },
      ),
      findFirst: jest.fn<
        Promise<GeneratedFileRecord | null>,
        [GeneratedFileFindFirstArgs]
      >(({ where }) =>
        Promise.resolve(
          generatedFiles.find(
            (record) =>
              record.containerId === where.containerId &&
              (where.id === undefined || record.id === where.id) &&
              (where.fileType === undefined ||
                record.fileType === where.fileType),
          ) ?? null,
        ),
      ),
      update: jest.fn<Promise<GeneratedFileRecord>, [GeneratedFileUpdateArgs]>(
        ({ where, data }) => {
          const record = generatedFiles.find((item) => item.id === where.id);
          if (!record) {
            throw new Error(`Generated file not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve(record);
        },
      ),
      updateMany: jest.fn<Promise<{ count: number }>, [any]>(
        ({ where, data }) => {
          const ids = new Set<string>(where.id.in);
          generatedFiles.forEach((record) => {
            if (ids.has(record.id)) {
              Object.assign(record, data);
            }
          });
          return Promise.resolve({ count: ids.size });
        },
      ),
      findMany: jest.fn<Promise<GeneratedFileRecord[]>, [any?]>((args) => {
        if (!args?.where) {
          return Promise.resolve(generatedFiles);
        }
        const where = args.where;
        return Promise.resolve(
          generatedFiles.filter(
            (record) =>
              record.containerId === where.containerId &&
              (where.status === undefined || record.status === where.status) &&
              (where.fileType === undefined ||
                where.fileType === record.fileType ||
                where.fileType.in?.includes(record.fileType)),
          ),
        );
      }),
    };
    mock.generatedFileReplacement = {
      createMany: jest.fn<Promise<{ count: number }>, [any]>(({ data }) =>
        Promise.resolve({ count: data.length }),
      ),
    };

    return mock;
  }
});
