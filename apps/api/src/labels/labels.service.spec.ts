import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LabelsService } from './labels.service';
import {
  WorkerLabelPayload,
  WorkerLabelRequest,
  WorkerLabelService,
} from './worker-label.service';
import { PrismaService } from '../prisma/prisma.service';

interface ContainerDestinationRecord {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string;
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  pallets: Array<{
    id: string;
    loadJobId: string | null;
    loadedAt: Date | null;
    status: string;
  }>;
}

interface ContainerRecord {
  id: string;
  importFileId: string | null;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string;
  company: string;
  destinations: ContainerDestinationRecord[];
}

interface PalletData {
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: Date | null;
}

interface PalletRecord extends PalletData {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PalletCreateArgs {
  data: PalletData;
}

interface PalletUpdateManyArgs {
  where: { id: { in: string[] } };
  data: {
    status: string;
    labelPrintedAt: Date;
  };
}

interface PalletDeleteManyArgs {
  where: { containerDestinationId: { in: string[] } };
}

interface PalletEventCreateManyArgs {
  data: Array<{
    palletId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string;
    scanPayload: string;
    metadata: unknown;
  }>;
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
  where: { containerId: string; fileType: string };
  orderBy?: { updatedAt: string };
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

interface ContainerUpdateArgs {
  where: { id: string };
  data: { status: string };
}

type TransactionCallback = (tx: LabelsPrismaMock) => Promise<any>;

interface LabelsPrismaMock {
  $transaction: jest.Mock<Promise<any>, [TransactionCallback]>;
  container: {
    findUnique: jest.Mock<Promise<ContainerRecord>, []>;
    update: jest.Mock<
      Promise<{ id: string; status: string }>,
      [ContainerUpdateArgs]
    >;
  };
  pallet: {
    create: jest.Mock<Promise<PalletRecord>, [PalletCreateArgs]>;
    deleteMany: jest.Mock<Promise<{ count: number }>, [PalletDeleteManyArgs]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [PalletUpdateManyArgs]>;
    findMany: jest.Mock<Promise<PalletRecord[]>, []>;
  };
  palletEvent: {
    createMany: jest.Mock<
      Promise<{ count: number }>,
      [PalletEventCreateManyArgs]
    >;
  };
  generatedFile: {
    create: jest.Mock<Promise<GeneratedFileRecord>, [GeneratedFileCreateArgs]>;
    findFirst: jest.Mock<
      Promise<GeneratedFileRecord | null>,
      [GeneratedFileFindFirstArgs]
    >;
    update: jest.Mock<Promise<GeneratedFileRecord>, [GeneratedFileUpdateArgs]>;
  };
}

interface WorkerLabelMock {
  writeLabels: jest.Mock<
    Promise<WorkerLabelPayload>,
    [WorkerLabelRequest, string, string]
  >;
}

interface PalletResultRequest {
  plans: Array<{ destinationCode: string; palletIds: string[] }>;
  totalFinalPallets: number;
}

describe('LabelsService', () => {
  let storageRoot: string;
  let outputPath: string;
  let prisma: LabelsPrismaMock;
  let workerLabel: WorkerLabelMock;
  let service: LabelsService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'p1-07-labels-service-'));
    outputPath = join(storageRoot, 'labels', 'CSNU8877228托盘面单.pdf');
    await mkdir(join(storageRoot, 'labels'), { recursive: true });
    await writeFile(outputPath, 'pdf bytes');
    prisma = createPrismaMock();

    const writeLabels = jest.fn<
      Promise<WorkerLabelPayload>,
      [WorkerLabelRequest, string, string]
    >((request, _outputDir, labelDate) =>
      Promise.resolve({
        task_status: 'SUCCESS',
        label_result: {
          outputPath,
          labelCount: 3,
          palletIds: palletIdsFromRequest(request),
          qrPayloads: qrPayloadsFromRequest(request, labelDate),
          warnings: [],
          errors: [],
        },
        warnings: [],
        errors: [],
      }),
    );
    workerLabel = { writeLabels };

    service = new LabelsService(
      prisma as unknown as PrismaService,
      workerLabel as unknown as WorkerLabelService,
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

  it('creates pallets from finalPallets, generates a PDF, and records generated_files', async () => {
    const result = await service.generateLabels('container-1');

    expect(result.generatedFile).toMatchObject({
      containerId: 'container-1',
      fileType: 'PALLET_LABEL_PDF',
      storagePath: outputPath,
      status: 'GENERATED',
    });
    expect(result.pallets).toHaveLength(3);
    expect(
      result.pallets.every((pallet) => pallet.status === 'LABEL_PRINTED'),
    ).toBe(true);
    expect(
      result.pallets.every((pallet) =>
        pallet.qrPayload.includes(pallet.palletId),
      ),
    ).toBe(true);

    expect(workerLabel.writeLabels).toHaveBeenCalledTimes(1);
    const [request, outputDir, labelDate] =
      workerLabel.writeLabels.mock.calls[0];
    const palletResult =
      request.pallet_result as unknown as PalletResultRequest;
    expect(outputDir).toBe(join(storageRoot, 'labels'));
    expect(labelDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(palletResult.totalFinalPallets).toBe(3);

    expect(prisma.pallet.create).toHaveBeenCalledTimes(3);
    const updateManyArgs = prisma.pallet.updateMany.mock.calls[0][0];
    expect(updateManyArgs.where.id.in).toEqual([
      'pallet-1',
      'pallet-2',
      'pallet-3',
    ]);
    expect(updateManyArgs.data.status).toBe('LABEL_PRINTED');
    expect(updateManyArgs.data.labelPrintedAt).toBeInstanceOf(Date);

    const generatedFileCreate = prisma.generatedFile.create.mock.calls[0][0];
    expect(generatedFileCreate.data.fileType).toBe('PALLET_LABEL_PDF');
    expect(generatedFileCreate.data.status).toBe('GENERATED');
    expect(generatedFileCreate.data.storagePath).toBe(outputPath);
    expect(typeof generatedFileCreate.data.fileSha256).toBe('string');

    expect(prisma.palletEvent.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.container.update).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      data: { status: 'LABELS_GENERATED' },
    });
  });

  it('generates labels for a manual container without an import file', async () => {
    const manualContainer = containerRecord();
    manualContainer.id = 'container-manual';
    manualContainer.importFileId = null;
    manualContainer.containerNo = 'MANU1234567';
    manualContainer.sourceFormat = 'UNKNOWN';
    manualContainer.parserVersion = 'manual-entry-v1';
    manualContainer.company = 'Manual Customer';
    manualContainer.destinations = [
      {
        id: 'destination-manual-1',
        containerId: 'container-manual',
        destinationCode: 'YEG1',
        destinationType: 'WAREHOUSE',
        cartons: 36,
        volume: '0.000',
        calculatedPallets: 0,
        manualPallets: 4,
        finalPallets: 4,
        pallets: [],
      },
    ];
    prisma.container.findUnique.mockResolvedValueOnce(manualContainer);

    const result = await service.generateLabels('container-manual');

    expect(result.generatedFile).toMatchObject({
      importFileId: null,
      containerId: 'container-manual',
      fileType: 'PALLET_LABEL_PDF',
      status: 'GENERATED',
    });
    expect(result.pallets).toHaveLength(4);
    expect(result.pallets[0]).toMatchObject({
      containerId: 'container-manual',
      destinationCode: 'YEG1',
    });
    expect(result.pallets[0].qrPayload).toContain('MANU1234567');
    expect(result.pallets[0].qrPayload).toContain(result.pallets[0].palletId);
  });

  it('replaces existing reusable label pallets when regenerating labels', async () => {
    const duplicateContainer = containerRecord();
    duplicateContainer.destinations = [
      {
        ...duplicateContainer.destinations[0],
        pallets: [
          {
            id: 'existing-pallet',
            loadJobId: null,
            loadedAt: null,
            status: 'LABEL_PRINTED',
          },
        ],
      },
    ];
    prisma.container.findUnique.mockResolvedValueOnce(duplicateContainer);

    const result = await service.generateLabels('container-1');

    expect(result.pallets).toHaveLength(2);
    expect(prisma.pallet.deleteMany).toHaveBeenCalledWith({
      where: { containerDestinationId: { in: ['destination-1'] } },
    });
    expect(workerLabel.writeLabels).toHaveBeenCalledTimes(1);
  });

  it('blocks label regeneration when existing pallets are already loaded', async () => {
    const loadedContainer = containerRecord();
    loadedContainer.destinations = [
      {
        ...loadedContainer.destinations[0],
        pallets: [
          {
            id: 'loaded-pallet',
            loadJobId: 'load-job-1',
            loadedAt: new Date('2026-06-26T00:05:00.000Z'),
            status: 'LOADED',
          },
        ],
      },
    ];
    prisma.container.findUnique.mockResolvedValueOnce(loadedContainer);

    await expect(service.generateLabels('container-1')).rejects.toHaveProperty(
      'response.code',
      'PALLETS_ALREADY_IN_USE',
    );
    expect(workerLabel.writeLabels).not.toHaveBeenCalled();
  });

  function createPrismaMock(): LabelsPrismaMock {
    const pallets: PalletRecord[] = [];
    const generatedFiles: GeneratedFileRecord[] = [];
    const mock = {} as LabelsPrismaMock;

    mock.$transaction = jest.fn<Promise<any>, [TransactionCallback]>(
      (callback) => callback(mock),
    );
    mock.container = {
      findUnique: jest
        .fn<Promise<ContainerRecord>, []>()
        .mockResolvedValue(containerRecord()),
      update: jest
        .fn<Promise<{ id: string; status: string }>, [ContainerUpdateArgs]>()
        .mockResolvedValue({
          id: 'container-1',
          status: 'LABELS_GENERATED',
        }),
    };
    mock.pallet = {
      create: jest.fn<Promise<PalletRecord>, [PalletCreateArgs]>(({ data }) => {
        const now = new Date('2026-06-26T00:00:00.000Z');
        const record: PalletRecord = {
          id: `pallet-${pallets.length + 1}`,
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        pallets.push(record);
        return Promise.resolve(record);
      }),
      deleteMany: jest.fn<Promise<{ count: number }>, [PalletDeleteManyArgs]>(
        ({ where }) => {
          const ids = new Set(where.containerDestinationId.in);
          const originalLength = pallets.length;
          for (let index = pallets.length - 1; index >= 0; index -= 1) {
            if (ids.has(pallets[index].containerDestinationId)) {
              pallets.splice(index, 1);
            }
          }
          return Promise.resolve({ count: originalLength - pallets.length });
        },
      ),
      updateMany: jest.fn<Promise<{ count: number }>, [PalletUpdateManyArgs]>(
        ({ where, data }) => {
          const ids = new Set<string>(where.id.in);
          pallets.forEach((pallet) => {
            if (ids.has(pallet.id)) {
              Object.assign(pallet, data);
            }
          });
          return Promise.resolve({ count: ids.size });
        },
      ),
      findMany: jest
        .fn<Promise<PalletRecord[]>, []>()
        .mockResolvedValue(pallets),
    };
    mock.palletEvent = {
      createMany: jest.fn<
        Promise<{ count: number }>,
        [PalletEventCreateManyArgs]
      >(({ data }) => Promise.resolve({ count: data.length })),
    };
    mock.generatedFile = {
      create: jest.fn<Promise<GeneratedFileRecord>, [GeneratedFileCreateArgs]>(
        ({ data }) => {
          const now = new Date('2026-06-26T00:01:00.000Z');
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
              record.fileType === where.fileType,
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
            updatedAt: new Date('2026-06-26T00:02:00.000Z'),
          });
          return Promise.resolve(record);
        },
      ),
    };

    return mock;
  }

  function containerRecord(): ContainerRecord {
    return {
      id: 'container-1',
      importFileId: 'import-1',
      containerNo: 'CSNU8877228',
      sourceFormat: 'UNLOADING_PLAN_CN',
      parserVersion: 'unloading-plan-cn-v1',
      company: 'Bestar',
      destinations: [
        {
          id: 'destination-1',
          containerId: 'container-1',
          destinationCode: 'YYZ',
          destinationType: 'AMAZON_FBA',
          cartons: 40,
          volume: '5.250',
          calculatedPallets: 2,
          manualPallets: null,
          finalPallets: 2,
          pallets: [],
        },
        {
          id: 'destination-2',
          containerId: 'container-1',
          destinationCode: 'YVR',
          destinationType: 'AMAZON_FBA',
          cartons: 20,
          volume: '2.100',
          calculatedPallets: 1,
          manualPallets: null,
          finalPallets: 1,
          pallets: [],
        },
      ],
    };
  }

  function palletIdsFromRequest(request: WorkerLabelRequest): string[] {
    return plansFromRequest(request).flatMap((plan) => plan.palletIds);
  }

  function qrPayloadsFromRequest(
    request: WorkerLabelRequest,
    labelDate: string,
  ): string[] {
    const containerNo = String(request.parsed_result.containerNo);
    const totalPallets = Number(request.pallet_result.totalFinalPallets);
    let globalIndex = 0;
    return plansFromRequest(request).flatMap((plan) =>
      plan.palletIds.map((palletId) => {
        globalIndex += 1;
        return [
          'SSP1',
          'PALLET',
          labelDate,
          containerNo,
          plan.destinationCode,
          `${globalIndex}/${totalPallets}`,
          palletId,
        ].join('|');
      }),
    );
  }

  function plansFromRequest(
    request: WorkerLabelRequest,
  ): Array<{ destinationCode: string; palletIds: string[] }> {
    const result = request.pallet_result as {
      plans: Array<{ destinationCode: string; palletIds: string[] }>;
    };
    return result.plans;
  }
});
