import { BadRequestException } from '@nestjs/common';
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

  it('rejects corrections when no value changes', async () => {
    await expect(
      service.updateContainerDestination('destination-1', {
        manualPallets: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.correctionFeedback.create).not.toHaveBeenCalled();
  });

  function createPrismaMock() {
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
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
    };
    const corrections: any[] = [];

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      container: {
        update: jest.fn().mockResolvedValue({
          id: 'container-1',
          status: 'CORRECTED',
        }),
      },
      containerDestination: {
        findUnique: jest.fn().mockResolvedValue(destination),
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
