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
  status: string;
  destinations: ContainerDestinationRecord[];
}

interface PalletData {
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: Date | null;
  loadedAt?: Date | null;
  loadJobId?: string | null;
}

interface PalletRecord extends PalletData {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  containerDestination?: {
    containerId: string;
    destinationCode: string;
    destinationType: string | null;
  };
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
    toStatus: string | null;
    scanPayload: string;
    operatorId: string;
    metadata: unknown;
  }>;
}

interface PalletEventCreateArgs {
  data: {
    palletId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    scanPayload: string;
    operatorId: string;
    occurredAt: Date;
    metadata: unknown;
  };
}

interface PalletEventRecord {
  id: string;
  palletId: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  scanPayload: string | null;
  metadata: unknown;
  operatorId: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
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
  user: {
    findUnique: jest.Mock<Promise<{ id: string } | null>, [unknown?]>;
  };
  container: {
    findUnique: jest.Mock<
      Promise<ContainerRecord | { id: string } | null>,
      [unknown?]
    >;
    update: jest.Mock<
      Promise<{ id: string; status: string }>,
      [ContainerUpdateArgs]
    >;
  };
  pallet: {
    create: jest.Mock<Promise<PalletRecord>, [PalletCreateArgs]>;
    deleteMany: jest.Mock<Promise<{ count: number }>, [PalletDeleteManyArgs]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [PalletUpdateManyArgs]>;
    findMany: jest.Mock<Promise<PalletRecord[]>, [unknown?]>;
    findUnique: jest.Mock<Promise<PalletRecord | null>, [unknown?]>;
  };
  palletEvent: {
    create: jest.Mock<Promise<PalletEventRecord>, [PalletEventCreateArgs]>;
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
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['labels.generate'],
  };
  const warehouseActor = {
    id: 'auth-warehouse',
    email: 'warehouse@example.com',
    name: 'Warehouse User',
    roles: ['WAREHOUSE'],
    permissions: ['labels.reprint'],
  };
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
    const result = await service.generateLabels('container-1', officeActor);

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
    expect(result.pallets.map((pallet) => pallet.qrPayload)).toEqual([
      expect.stringContaining('|YYZ|1|'),
      expect.stringContaining('|YYZ|2|'),
      expect.stringContaining('|YVR|1|'),
    ]);

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
    expect(generatedFileCreate.data.generatedById).toBe('auth-office');

    expect(prisma.palletEvent.createMany).toHaveBeenCalledTimes(2);
    expect(
      prisma.palletEvent.createMany.mock.calls.flatMap((call) =>
        call[0].data.map((event) => event.operatorId),
      ),
    ).toEqual([
      'auth-office',
      'auth-office',
      'auth-office',
      'auth-office',
      'auth-office',
      'auth-office',
    ]);
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

    const result = await service.generateLabels(
      'container-manual',
      officeActor,
    );

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

    const result = await service.generateLabels('container-1', officeActor);

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

    await expect(
      service.generateLabels('container-1', officeActor),
    ).rejects.toHaveProperty('response.code', 'CONTAINER_GENERATION_LOCKED');
    expect(workerLabel.writeLabels).not.toHaveBeenCalled();
  });

  it('blocks label regeneration when the container status is loading', async () => {
    prisma.container.findUnique.mockResolvedValueOnce({
      ...containerRecord(),
      status: 'LOADING_IN_PROGRESS',
    });

    await expect(
      service.generateLabels('container-1', officeActor),
    ).rejects.toHaveProperty('response.code', 'CONTAINER_GENERATION_LOCKED');
    expect(workerLabel.writeLabels).not.toHaveBeenCalled();
  });

  it('blocks label regeneration when the container is unloaded', async () => {
    prisma.container.findUnique.mockResolvedValueOnce({
      ...containerRecord(),
      status: 'UNLOADED',
    });

    await expect(
      service.generateLabels('container-1', officeActor),
    ).rejects.toHaveProperty('response.code', 'CONTAINER_GENERATION_LOCKED');
    expect(workerLabel.writeLabels).not.toHaveBeenCalled();
  });

  it('records a pallet reprint audit event without changing pallet status', async () => {
    const loadedPallet = palletRecord({
      id: 'pallet-loaded',
      status: 'LOADED',
      loadedAt: new Date('2026-06-26T01:00:00.000Z'),
    });
    prisma.pallet.findUnique.mockResolvedValueOnce(loadedPallet);

    const result = await service.reprintPalletLabel(
      'pallet-loaded',
      {
        operatorId: 'user-1',
        reason: 'Original label was damaged during loading',
      },
      warehouseActor,
    );

    expect(result.event).toMatchObject({
      palletRecordId: 'pallet-loaded',
      businessPalletId: loadedPallet.palletId,
      userId: 'auth-warehouse',
      reason: 'Original label was damaged during loading',
      palletStatus: 'LOADED',
      supervisorOverride: false,
    });
    expect(result.pallet.status).toBe('LOADED');
    expect(prisma.palletEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        palletId: 'pallet-loaded',
        eventType: 'REPRINTED',
        fromStatus: 'LOADED',
        toStatus: 'LOADED',
        scanPayload: loadedPallet.qrPayload,
        operatorId: 'auth-warehouse',
        metadata: expect.objectContaining({
          action: 'PALLET_LABEL_REPRINT',
          reason: 'Original label was damaged during loading',
          scope: 'PALLET',
          supervisorOverride: false,
          businessPalletId: loadedPallet.palletId,
        }),
      }),
    });
    expect(prisma.pallet.updateMany).not.toHaveBeenCalled();
  });

  it('records container reprint audit events for every pallet without status changes', async () => {
    const first = palletRecord({ id: 'pallet-1', status: 'LABEL_PRINTED' });
    const second = palletRecord({ id: 'pallet-2', status: 'LOADED' });
    prisma.pallet.findMany.mockResolvedValueOnce([first, second]);

    const result = await service.reprintContainerLabels(
      'container-1',
      {
        operatorId: 'user-1',
        reason: 'Warehouse requested a full label set reprint',
      },
      warehouseActor,
    );

    expect(result).toMatchObject({
      containerId: 'container-1',
      eventCount: 2,
      events: [
        {
          palletRecordId: 'pallet-1',
          palletStatus: 'LABEL_PRINTED',
          userId: 'auth-warehouse',
        },
        {
          palletRecordId: 'pallet-2',
          palletStatus: 'LOADED',
          userId: 'auth-warehouse',
        },
      ],
    });
    expect(prisma.palletEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.palletEvent.create.mock.calls[0][0].data).toMatchObject({
      palletId: 'pallet-1',
      eventType: 'REPRINTED',
      fromStatus: 'LABEL_PRINTED',
      toStatus: 'LABEL_PRINTED',
      operatorId: 'auth-warehouse',
      metadata: expect.objectContaining({ scope: 'CONTAINER' }),
    });
    expect(prisma.palletEvent.create.mock.calls[1][0].data).toMatchObject({
      palletId: 'pallet-2',
      eventType: 'REPRINTED',
      fromStatus: 'LOADED',
      toStatus: 'LOADED',
      operatorId: 'auth-warehouse',
      metadata: expect.objectContaining({ scope: 'CONTAINER' }),
    });
    expect(prisma.pallet.updateMany).not.toHaveBeenCalled();
  });

  it('blocks cancelled pallet reprint unless supervisor override is provided', async () => {
    const cancelled = palletRecord({
      id: 'pallet-cancelled',
      status: 'CANCELLED',
    });
    prisma.pallet.findUnique.mockResolvedValueOnce(cancelled);

    await expect(
      service.reprintPalletLabel(
        'pallet-cancelled',
        {
          operatorId: 'user-1',
          reason: 'Reprint requested after cancellation',
        },
        warehouseActor,
      ),
    ).rejects.toHaveProperty(
      'response.code',
      'REPRINT_REQUIRES_SUPERVISOR_OVERRIDE',
    );
    expect(prisma.palletEvent.create).not.toHaveBeenCalled();

    prisma.pallet.findUnique.mockResolvedValueOnce(cancelled);
    const result = await service.reprintPalletLabel(
      'pallet-cancelled',
      {
        operatorId: 'user-1',
        reason: 'Supervisor approved one-time reprint',
        supervisorOverride: true,
      },
      warehouseActor,
    );

    expect(result.event).toMatchObject({
      palletRecordId: 'pallet-cancelled',
      palletStatus: 'CANCELLED',
      supervisorOverride: true,
    });
    expect(prisma.palletEvent.create).toHaveBeenCalledTimes(1);
  });

  function createPrismaMock(): LabelsPrismaMock {
    const pallets: PalletRecord[] = [];
    const palletEvents: PalletEventRecord[] = [];
    const generatedFiles: GeneratedFileRecord[] = [];
    const mock = {} as LabelsPrismaMock;

    mock.$transaction = jest.fn<Promise<any>, [TransactionCallback]>(
      (callback) => callback(mock),
    );
    mock.user = {
      findUnique: jest
        .fn<Promise<{ id: string } | null>, [unknown?]>()
        .mockResolvedValue({ id: 'user-1' }),
    };
    mock.container = {
      findUnique: jest
        .fn<Promise<ContainerRecord | { id: string } | null>, [unknown?]>()
        .mockImplementation((args) => {
          if (
            args &&
            typeof args === 'object' &&
            'select' in args &&
            (args as { select?: { id?: boolean } }).select?.id
          ) {
            return Promise.resolve({ id: 'container-1' });
          }
          return Promise.resolve(containerRecord());
        }),
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
        .fn<Promise<PalletRecord[]>, [unknown?]>()
        .mockResolvedValue(pallets),
      findUnique: jest
        .fn<Promise<PalletRecord | null>, [unknown?]>()
        .mockResolvedValue(null),
    };
    mock.palletEvent = {
      create: jest.fn<Promise<PalletEventRecord>, [PalletEventCreateArgs]>(
        ({ data }) => {
          const now = new Date('2026-06-26T00:04:00.000Z');
          const record: PalletEventRecord = {
            id: `pallet-event-${palletEvents.length + 1}`,
            palletId: data.palletId,
            eventType: data.eventType,
            fromStatus: data.fromStatus,
            toStatus: data.toStatus,
            scanPayload: data.scanPayload,
            metadata: data.metadata,
            operatorId: data.operatorId,
            occurredAt: data.occurredAt,
            createdAt: now,
            updatedAt: now,
          };
          palletEvents.push(record);
          return Promise.resolve(record);
        },
      ),
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
      status: 'CORRECTED',
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

  function palletRecord(override: Partial<PalletRecord> = {}): PalletRecord {
    const now = new Date('2026-06-26T00:00:00.000Z');
    return {
      id: 'pallet-1',
      containerDestinationId: 'destination-1',
      palletNo: 1,
      palletId: 'CSNU8877228-D001-YYZ-P001',
      qrPayload:
        'SSP1|PALLET|2026-06-26|CSNU8877228|YYZ|1|CSNU8877228-D001-YYZ-P001',
      status: 'LABEL_PRINTED',
      labelPrintedAt: new Date('2026-06-26T00:05:00.000Z'),
      loadedAt: null,
      loadJobId: null,
      createdAt: now,
      updatedAt: now,
      containerDestination: {
        containerId: 'container-1',
        destinationCode: 'YYZ',
        destinationType: 'AMAZON_FBA',
      },
      ...override,
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
    return plansFromRequest(request).flatMap((plan) =>
      plan.palletIds.map((palletId, index) => {
        return [
          'SSP1',
          'PALLET',
          labelDate,
          containerNo,
          plan.destinationCode,
          `${index + 1}`,
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
