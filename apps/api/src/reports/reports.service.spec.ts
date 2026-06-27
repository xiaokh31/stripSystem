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
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number;
  finalPallets: number;
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
    findMany: jest.Mock<Promise<GeneratedFileRecord[]>, []>;
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
  calculatedPallets: number;
  manualPallets: number;
  finalPallets: number;
}

interface PalletReportPayload {
  plans: PalletReportPlan[];
  totalFinalPallets: number;
}

describe('ReportsService', () => {
  let storageRoot: string;
  let outputPath: string;
  let prisma: ReportsPrismaMock;
  let workerReport: WorkerReportMock;
  let service: ReportsService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'p1-06-reports-service-'));
    outputPath = join(storageRoot, 'reports', 'CSNU8877228卸柜报告-En.xlsx');
    await mkdir(join(storageRoot, 'reports'), { recursive: true });
    await writeFile(outputPath, 'xlsx bytes');
    prisma = createPrismaMock();
    const successPayload: WorkerReportPayload = {
      task_status: 'SUCCESS',
      report_result: {
        outputPath,
        warnings: [],
        errors: [],
      },
      warnings: [],
      errors: [],
    };
    const writeReport = jest.fn<
      Promise<WorkerReportPayload>,
      [WorkerReportRequest, string]
    >();
    writeReport.mockResolvedValue(successPayload);
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
    const result = await service.generateReport('container-1');

    expect(workerReport.writeReport).toHaveBeenCalledTimes(1);
    const [request, reportDir] = workerReport.writeReport.mock.calls[0];
    const palletResult =
      request.pallet_result as unknown as PalletReportPayload;
    expect(reportDir).toBe(join(storageRoot, 'reports'));
    expect(palletResult.totalFinalPallets).toBe(7);
    expect(palletResult.plans[0]).toMatchObject({
      destinationCode: 'YYZ',
      calculatedPallets: 4,
      manualPallets: 7,
      finalPallets: 7,
    });
    expect(result.generatedFile).toMatchObject({
      containerId: 'container-1',
      fileType: 'EXCEL_REPORT',
      storagePath: outputPath,
      status: 'GENERATED',
      errorMessage: null,
    });
    const generatedFileCreate = prisma.generatedFile.create.mock.calls[0][0];
    expect(generatedFileCreate.data.fileType).toBe('EXCEL_REPORT');
    expect(generatedFileCreate.data.status).toBe('GENERATED');
    expect(generatedFileCreate.data.storagePath).toBe(outputPath);
    expect(typeof generatedFileCreate.data.fileSha256).toBe('string');
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

    const result = await service.generateReport('container-manual');

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
    const generated = await service.generateReport('container-1');
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

    await expect(service.generateReport('container-1')).rejects.toHaveProperty(
      'response.code',
      'REPORT_GENERATION_FAILED',
    );

    const failedFileCreate = prisma.generatedFile.create.mock.calls[0][0];
    expect(failedFileCreate.data.fileType).toBe('EXCEL_REPORT');
    expect(failedFileCreate.data.status).toBe('FAILED');
    expect(failedFileCreate.data.storagePath).toBe(
      join(storageRoot, 'reports', 'CSNU8877228卸柜报告-En.xlsx'),
    );
    expect(failedFileCreate.data.fileSha256).toBeNull();
    expect(failedFileCreate.data.errorMessage).toBe(
      'Report template could not be opened',
    );
    expect(prisma.container.update).not.toHaveBeenCalled();
  });

  it('updates the existing Excel report record when regenerating', async () => {
    const first = await service.generateReport('container-1');
    const second = await service.generateReport('container-1');

    expect(second.generatedFile.id).toBe(first.generatedFile.id);
    expect(prisma.generatedFile.create).toHaveBeenCalledTimes(1);
    expect(prisma.generatedFile.update).toHaveBeenCalledTimes(1);
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
          cartons: 40,
          volume: '5.250',
          calculatedPallets: 4,
          manualPallets: 7,
          finalPallets: 7,
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
      findMany: jest
        .fn<Promise<GeneratedFileRecord[]>, []>()
        .mockResolvedValue(generatedFiles),
    };

    return mock;
  }
});
