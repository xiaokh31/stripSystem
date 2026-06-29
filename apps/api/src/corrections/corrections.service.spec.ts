import { BadRequestException, ConflictException } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CorrectionsService', () => {
  let prisma: any;
  let service: CorrectionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CorrectionsService(prisma as PrismaService);
  });

  it('updates manualPallets, recalculates finalPallets, and writes audit rows', async () => {
    const result = await service.updateContainerDestination('destination-1', {
      manualPallets: 7,
      reason: 'Office review',
      correctionNote: 'Customer confirmed pallet split',
    });

    expect(result.containerDestination).toMatchObject({
      id: 'destination-1',
      manualPallets: 7,
      finalPallets: 7,
    });
    expect(result.corrections).toHaveLength(2);
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'manualPallets',
      'finalPallets',
    ]);
    expect(prisma.correctionFeedback.create).toHaveBeenCalledTimes(2);
    expect(prisma.container.update).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      data: { status: 'CORRECTED' },
    });
  });

  it('reads full container detail with destination correction fields', async () => {
    const result = await service.getContainer('container-1');

    expect(result).toMatchObject({
      id: 'container-1',
      containerNo: 'CSNU8877228',
      company: 'BESTAR',
      status: 'PARSED',
      totalCartons: 40,
      totalVolumeCbm: '5.250',
      destinations: [
        {
          id: 'destination-1',
          destinationCode: 'YYZ',
          destinationType: 'AMAZON_FBA',
          totalCartons: 40,
          totalVolumeCbm: '5.250',
          calculatedPallets: 4,
          manualPallets: null,
          finalPallets: 4,
        },
      ],
    });
    expect(prisma.container.findUnique).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      include: {
        destinations: {
          include: {
            pallets: {
              select: {
                status: true,
                loadJobId: true,
                loadedAt: true,
              },
            },
          },
          orderBy: [{ destinationCode: 'asc' }, { destinationType: 'asc' }],
        },
      },
    });
  });

  it('creates a manual unloading container with destinations and audit rows', async () => {
    const result = await service.createManualContainer({
      containerNo: 'MANU1234567',
      company: 'Manual Customer',
      dockNo: 'D7',
      reason: 'Original manifest could not be parsed',
      correctionNote: 'Created from office manual entry',
      destinations: [
        {
          destinationCode: 'YEG1',
          destinationType: 'WAREHOUSE',
          cartons: 36,
          pallets: 4,
          note: 'Manual report line',
        },
        {
          destinationCode: 'YVR2',
          cartons: 12,
          pallets: 2,
          volume: 1.5,
        },
      ],
    });

    expect(result.container).toMatchObject({
      importFileId: null,
      containerNo: 'MANU1234567',
      dockNo: 'D7',
      company: 'Manual Customer',
      sourceFormat: 'UNKNOWN',
      parserVersion: 'manual-entry-v1',
      status: 'CORRECTED',
      totalCartons: 48,
      totalVolumeCbm: '1.500',
      destinations: [
        expect.objectContaining({
          destinationCode: 'YEG1',
          totalCartons: 36,
          totalVolumeCbm: '0.000',
          manualPallets: 4,
          finalPallets: 4,
        }),
        expect.objectContaining({
          destinationCode: 'YVR2',
          totalCartons: 12,
          totalVolumeCbm: '1.500',
          manualPallets: 2,
          finalPallets: 2,
        }),
      ],
    });
    expect(result.corrections.map((record) => record.fieldName)).toEqual([
      'manualContainer',
      'manualContainerDestination',
      'manualContainerDestination',
    ]);
    expect(prisma.container.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        containerNo: 'MANU1234567',
        sourceFormat: 'UNKNOWN',
        parserVersion: 'manual-entry-v1',
        status: 'CORRECTED',
      }),
    });
    expect(prisma.containerDestination.create).toHaveBeenCalledTimes(2);
    expect(prisma.containerDestination.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        containerId: result.container.id,
        destinationCode: 'YEG1',
        cartons: 36,
        calculatedPallets: 0,
        manualPallets: 4,
        finalPallets: 4,
      }),
    });
    expect(prisma.containerDestination.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        containerId: result.container.id,
        destinationCode: 'YVR2',
        cartons: 12,
        volume: '1.500',
        calculatedPallets: 0,
        manualPallets: 2,
        finalPallets: 2,
      }),
    });
    expect(prisma.correctionFeedback.create).toHaveBeenCalledTimes(3);
  });

  it('updates container lifecycle status and writes audit feedback', async () => {
    const result = await service.updateContainer('container-1', {
      correctionNote: 'Reset after test label generation',
      reason: 'Office lifecycle correction',
      status: 'LABELS_GENERATED',
    });

    expect(result.container).toMatchObject({
      id: 'container-1',
      status: 'LABELS_GENERATED',
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({
      containerId: 'container-1',
      fieldName: 'status',
      oldValue: 'PARSED',
      newValue: 'LABELS_GENERATED',
    });
  });

  it('rejects manual LOADED status when pallets remain unloaded', async () => {
    containersFixture(prisma)[0].destinations[0].pallets = [
      {
        loadJobId: null,
        loadedAt: null,
        status: 'LABEL_PRINTED',
      },
    ];

    await expect(
      service.updateContainer('container-1', {
        status: 'LOADED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a manual actual unloading destination and writes audit rows', async () => {
    const result = await service.createContainerDestination('container-1', {
      cartons: 12,
      correctionNote: 'Added from returned paper report',
      destinationCode: 'MANUAL-YYZ',
      destinationType: 'WAREHOUSE',
      manualPallets: 2,
      note: 'Actual unloading entry',
      volume: 1.25,
    });

    expect(result.containerDestination).toMatchObject({
      containerId: 'container-1',
      destinationCode: 'MANUAL-YYZ',
      cartons: 12,
      volume: '1.250',
      manualPallets: 2,
      finalPallets: 2,
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]).toMatchObject({
      containerId: 'container-1',
      containerDestinationId: result.containerDestination.id,
      fieldName: 'containerDestination',
    });
  });

  it('rejects corrections when no value changes', async () => {
    await expect(
      service.updateContainerDestination('destination-1', {
        manualPallets: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  it('rejects destination corrections after loading has started', async () => {
    containersFixture(prisma)[0].status = 'LOADING_IN_PROGRESS';
    prisma.containerDestination.findUnique.mockResolvedValueOnce({
      id: 'destination-1',
      containerId: 'container-1',
      destinationCode: 'YYZ',
      destinationType: 'AMAZON_FBA',
      cartons: 40,
      volume: '5.250',
      calculatedPallets: 4,
      manualPallets: null,
      finalPallets: 4,
      note: null,
      warnings: [],
      errors: [],
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      container: {
        status: 'LOADING_IN_PROGRESS',
      },
    });

    await expect(
      service.updateContainerDestination('destination-1', {
        manualPallets: 7,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.containerDestination.update).not.toHaveBeenCalled();
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-1',
        importFileId: 'import-1',
        containerNo: 'CSNU8877228',
        dockNo: null,
        company: 'BESTAR',
        sourceFormat: 'UNLOADING_PLAN_CN',
        parserVersion: 'unloading-plan-cn-v1',
        status: 'PARSED',
        rawJson: {},
        warnings: [],
        errors: [],
        destinations: [] as any[],
        createdAt: new Date('2026-06-26T00:00:00.000Z'),
        updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      },
    ];
    const destination = {
      id: 'destination-1',
      containerId: 'container-1',
      destinationCode: 'YYZ',
      destinationType: 'AMAZON_FBA',
      cartons: 40,
      volume: '5.250',
      calculatedPallets: 4,
      manualPallets: null,
      finalPallets: 4,
      note: null,
      warnings: [],
      errors: [],
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
    };
    const corrections: any[] = [];
    let manualDestinationCount = 0;
    containers[0].destinations = [destination];

    const mock: any = {
      __containers: containers,
      $transaction: jest.fn((callback) => callback(mock)),
      container: {
        create: jest.fn(({ data }) => {
          const created = {
            id: `container-${containers.length + 1}`,
            importFileId: null,
            ...data,
            destinations: [],
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          containers.push(created);
          return Promise.resolve(created);
        }),
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            containers.find((container) => container.id === where.id) ?? null,
          ),
        ),
        update: jest.fn(({ where, data }) => {
          const container = containers.find((item) => item.id === where.id);
          if (!container) {
            throw new Error(`Container not found: ${where.id}`);
          }
          Object.assign(container, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve({
            ...container,
            destinations: undefined,
          });
        }),
      },
      containerDestination: {
        findUnique: jest.fn().mockResolvedValue(destination),
        create: jest.fn(({ data }) => {
          manualDestinationCount += 1;
          const created = {
            id: `destination-created-${manualDestinationCount}`,
            ...data,
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          const container = containers.find(
            (record) => record.id === data.containerId,
          );
          container?.destinations.push(created);
          return Promise.resolve(created);
        }),
        update: jest.fn(({ data }) => {
          Object.assign(destination, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve(destination);
        }),
      },
      correctionFeedback: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `correction-${corrections.length + 1}`,
            importFileId: null,
            containerLineId: null,
            palletId: null,
            generatedFileId: null,
            ...data,
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          corrections.push(record);
          return Promise.resolve(record);
        }),
      },
    };

    return mock;
  }
});

function containersFixture(prisma: any): any[] {
  return prisma.__containers as any[];
}
