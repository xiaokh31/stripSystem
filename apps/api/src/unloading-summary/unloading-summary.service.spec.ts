import { ConfigService } from '@nestjs/config';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnloadingSummaryService } from './unloading-summary.service';

describe('UnloadingSummaryService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['unloading_summary.read', 'unloading_summary.export'],
  };

  let storageRoot: string;
  let generatedFiles: any[];
  let prisma: any;
  let workerSummary: any;
  let service: UnloadingSummaryService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'unloading-summary-service-'));
    generatedFiles = [];
    const containers = containerFixtures();
    const payContainers = payContainerFixtures(containers);

    prisma = {
      payContainer: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            payContainers.filter((payContainer) => {
              const completedAt = payContainer.completedAt
                ? new Date(payContainer.completedAt).getTime()
                : Number.NaN;
              return (
                !Number.isNaN(completedAt) &&
                completedAt >= where.completedAt.gte.getTime() &&
                completedAt < where.completedAt.lt.getTime()
              );
            }),
          ),
        ),
      },
      container: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            containers.filter((container) =>
              where.status.in.includes(container.status),
            ),
          ),
        ),
      },
      generatedFile: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            generatedFiles.filter((file) => file.fileType === where.fileType),
          ),
        ),
        create: jest.fn(({ data }) => {
          const record = {
            id: `generated-file-${generatedFiles.length + 1}`,
            importFileId: null,
            containerId: null,
            createdAt: new Date('2026-07-06T10:00:00.000Z'),
            updatedAt: new Date('2026-07-06T10:00:00.000Z'),
            ...data,
          };
          generatedFiles.push(record);
          return Promise.resolve(record);
        }),
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            generatedFiles.find(
              (file) =>
                file.id === where.id && file.fileType === where.fileType,
            ) ?? null,
          ),
        ),
      },
    };
    workerSummary = {
      writeSummary: jest.fn(async (payload, outputDir) => {
        await mkdir(outputDir, { recursive: true });
        const outputPath = join(outputDir, 'monthly-summary.xlsx');
        await writeFile(outputPath, `xlsx bytes ${payload.month}`);
        return {
          task_status: 'GENERATED',
          summary_result: {
            outputPath,
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            warnings: [],
            errors: [],
          },
        };
      }),
    };
    service = new UnloadingSummaryService(prisma, workerSummary, {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'app.storageRoot') {
          return storageRoot;
        }
        throw new Error(`Unexpected config key ${key}`);
      }),
    } as unknown as ConfigService);
  });

  it('summarizes completed unloading containers by selected completion month', async () => {
    const response = await service.getSummary('2026-06');

    expect(response.sourceContainerCount).toBe(2);
    expect(response.rows.map((row) => row.containerNo)).toEqual([
      'BEAU5946301',
      'LOADED1234567',
    ]);
    expect(response.rows[0]).toMatchObject({
      businessTag: '海柜',
      dateBusinessTag: '6.4海柜',
      destinationText: 'YYC4 / AMAZON_FBA',
      quantityText: '40件 / 8托',
      referenceText: '124115028975',
      appointmentText: '06/03/2026 19:00 MDT',
    });
    expect(response.rows.map((row) => row.containerNo)).not.toContain(
      'LABELS000001',
    );
    expect(response.rows.map((row) => row.containerNo)).not.toContain(
      'JULY0000001',
    );
    expect(response.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_UNLOADING_COMPLETED_AT',
          containerNo: 'NODATE00001',
        }),
        expect.objectContaining({
          code: 'SOURCE_CONTAINER_NOT_COMPLETED_UNLOADING_STATUS',
          containerNo: 'LABELS000001',
        }),
      ]),
    );
  });

  it('generates an xlsx export record and exposes a safe download', async () => {
    const response = await service.exportSummary('2026-06', officeActor);

    expect(response.generatedFile).toMatchObject({
      fileType: 'MONTHLY_UNLOADING_SUMMARY_XLSX',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      status: 'GENERATED',
      downloadUrl: '/api/unloading-summary/exports/generated-file-1/download',
    });
    expect(response.generatedFile.fileSha256).toEqual(expect.any(String));
    expect(Number(response.generatedFile.fileSizeBytes)).toBeGreaterThan(0);
    expect(generatedFiles[0].generatedById).toBe('auth-office');
    expect(workerSummary.writeSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        month: '2026-06',
        rows: expect.arrayContaining([
          expect.objectContaining({ containerNo: 'BEAU5946301' }),
        ]),
      }),
      expect.stringContaining('/unloading_summary/2026-06/'),
    );

    const download = await service.downloadExport(response.generatedFile.id);
    expect(download.filename).toBe('monthly-summary.xlsx');
    expect(download.buffer.toString()).toBe('xlsx bytes 2026-06');
  });

  function containerFixtures() {
    const completedPayContainer = {
      id: 'pay-container-1',
      payContainerNo: 'PC-OCEAN-BEAU5946301',
      completedAt: new Date('2026-06-04T17:10:00.000Z'),
      status: 'COMPLETED',
    };
    return [
      {
        id: 'container-1',
        containerNo: 'BEAU5946301',
        status: 'UNLOADED',
        payClassification: 'OCEAN_CONTAINER',
        payTrailerNumber: null,
        rawJson: {},
        destinations: [
          {
            id: 'destination-1',
            destinationCode: 'YYC4',
            destinationType: 'AMAZON_FBA',
            cartons: 40,
            calculatedPallets: 8,
            manualPallets: null,
            finalPallets: 8,
            note: 'Office reviewed',
            warnings: null,
            errors: null,
          },
        ],
        lines: [
          {
            id: 'line-1',
            lineNo: 1,
            destinationCode: 'YYC4',
            destinationType: 'AMAZON_FBA',
            cartons: 40,
            rawJson: {
              referenceNo: '124115028975',
              appointmentTime: '06/03/2026 19:00 MDT',
            },
          },
        ],
        payContainerLinks: [
          {
            id: 'link-1',
            payContainerId: 'pay-container-1',
            containerId: 'container-1',
            containerNo: 'BEAU5946301',
            payContainer: completedPayContainer,
          },
        ],
      },
      {
        id: 'container-2',
        containerNo: 'LABELS000001',
        status: 'LABELS_GENERATED',
        rawJson: {},
        destinations: [],
        lines: [],
        payContainerLinks: [],
      },
      {
        id: 'container-3',
        containerNo: 'LOADED1234567',
        status: 'LOADED',
        rawJson: {},
        destinations: [
          {
            id: 'destination-3',
            destinationCode: 'YEG2',
            destinationType: null,
            cartons: 12,
            calculatedPallets: 2,
            manualPallets: 3,
            finalPallets: 3,
            note: null,
            warnings: null,
            errors: null,
          },
        ],
        lines: [
          {
            id: 'line-3',
            lineNo: 1,
            destinationCode: 'YEG2',
            destinationType: null,
            cartons: 12,
            rawJson: {
              shipment: 'SHIP-777',
              appointment: '06/04/2026 09:00 MDT',
            },
          },
        ],
        payContainerLinks: [
          {
            id: 'link-3',
            payContainerId: 'pay-container-loaded',
            containerId: 'container-3',
            containerNo: 'LOADED1234567',
            payContainer: {
              id: 'pay-container-loaded',
              payContainerNo: 'PC-OCEAN-LOADED1234567',
              completedAt: new Date('2026-06-08T09:00:00.000Z'),
              status: 'SETTLED',
            },
          },
        ],
      },
      {
        id: 'container-4',
        containerNo: 'JULY0000001',
        status: 'UNLOADED',
        rawJson: {},
        destinations: [],
        lines: [],
        payContainerLinks: [
          {
            id: 'link-4',
            payContainerId: 'pay-container-july',
            containerId: 'container-4',
            containerNo: 'JULY0000001',
            payContainer: {
              id: 'pay-container-july',
              payContainerNo: 'PC-OCEAN-JULY0000001',
              completedAt: new Date('2026-07-01T09:00:00.000Z'),
              status: 'COMPLETED',
            },
          },
        ],
      },
      {
        id: 'container-5',
        containerNo: 'NODATE00001',
        status: 'UNLOADED',
        rawJson: {},
        destinations: [],
        lines: [],
        payContainerLinks: [
          {
            id: 'link-no-date',
            payContainerId: 'pay-container-no-date',
            containerId: 'container-5',
            containerNo: 'NODATE00001',
            payContainer: {
              id: 'pay-container-no-date',
              payContainerNo: 'PC-OCEAN-NODATE00001',
              completedAt: null,
              status: 'COMPLETED',
            },
          },
        ],
      },
    ];
  }

  function payContainerFixtures(containers: any[]) {
    return [
      {
        id: 'pay-container-1',
        payContainerNo: 'PC-OCEAN-BEAU5946301',
        classification: 'OCEAN_CONTAINER',
        trailerNumber: null,
        status: 'COMPLETED',
        completedAt: new Date('2026-06-04T17:10:00.000Z'),
        sourceContainers: [
          {
            id: 'link-1',
            containerId: 'container-1',
            containerNo: 'BEAU5946301',
            container: containers[0],
          },
          {
            id: 'link-2',
            containerId: 'container-2',
            containerNo: 'LABELS000001',
            container: containers[1],
          },
        ],
      },
      {
        id: 'pay-container-loaded',
        payContainerNo: 'PC-OCEAN-LOADED1234567',
        classification: 'OCEAN_CONTAINER',
        trailerNumber: null,
        status: 'SETTLED',
        completedAt: new Date('2026-06-08T09:00:00.000Z'),
        sourceContainers: [
          {
            id: 'link-3',
            containerId: 'container-3',
            containerNo: 'LOADED1234567',
            container: containers[2],
          },
        ],
      },
      {
        id: 'pay-container-july',
        payContainerNo: 'PC-OCEAN-JULY0000001',
        classification: 'OCEAN_CONTAINER',
        trailerNumber: null,
        status: 'COMPLETED',
        completedAt: new Date('2026-07-01T09:00:00.000Z'),
        sourceContainers: [
          {
            id: 'link-4',
            containerId: 'container-4',
            containerNo: 'JULY0000001',
            container: containers[3],
          },
        ],
      },
    ];
  }
});
