import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

interface CorrectionBody {
  id: string;
  targetType: string;
  containerId: string | null;
  containerDestinationId: string | null;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
}

interface CorrectionListBody {
  items: CorrectionBody[];
  limit: number;
  offset: number;
}

describe('CorrectionsController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: any;

  beforeEach(async () => {
    prisma = createPrismaMock();

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

  it('updates destination manual pallets, recalculates final pallets, and lists audit rows', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/container-destinations/destination-1')
      .send({
        manualPallets: 9,
        reason: 'Office correction',
        correctionNote: 'Customer confirmed revised pallet count',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      containerDestination: {
        id: 'destination-1',
        manualPallets: 9,
        finalPallets: 9,
      },
    });
    expect(response.body.corrections).toHaveLength(2);

    const list = await request(app.getHttpServer())
      .get('/api/corrections?containerDestinationId=destination-1')
      .expect(200);
    const body = list.body as CorrectionListBody;

    expect(body.items.map((item) => item.fieldName)).toEqual([
      'finalPallets',
      'manualPallets',
    ]);
    expect(body.items.every((item) => item.containerId === 'container-1')).toBe(
      true,
    );
  });

  it('updates container fields and creates correction feedback', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/containers/container-1')
      .send({
        dockNo: 'D12',
        company: 'Bestar CCA',
        reason: 'Warehouse assignment',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      container: {
        id: 'container-1',
        dockNo: 'D12',
        company: 'Bestar CCA',
        status: 'CORRECTED',
      },
    });
    expect(response.body.corrections.map((item) => item.fieldName)).toEqual([
      'dockNo',
      'company',
    ]);
  });

  it('creates a manual destination for actual unloading data and creates audit feedback', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/containers/container-1/destinations')
      .send({
        cartons: 12,
        correctionNote: 'Entered from returned paper report',
        destinationCode: 'MANUAL-YYZ',
        destinationType: 'WAREHOUSE',
        manualPallets: 2,
        note: 'Actual unloading note',
        volume: 1.25,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      containerDestination: {
        containerId: 'container-1',
        destinationCode: 'MANUAL-YYZ',
        cartons: 12,
        volume: '1.250',
        manualPallets: 2,
        finalPallets: 2,
      },
    });
    expect(response.body.corrections).toHaveLength(1);
    expect(response.body.corrections[0]).toMatchObject({
      containerId: 'container-1',
      fieldName: 'containerDestination',
      targetType: 'CONTAINER_DESTINATION',
    });
  });

  it('creates and lists standalone correction feedback with target validation', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/corrections')
      .send({
        targetType: 'CONTAINER',
        containerId: 'container-1',
        fieldName: 'company',
        oldValue: null,
        newValue: 'Bestar CCA',
        reason: 'Manual audit import',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      targetType: 'CONTAINER',
      containerId: 'container-1',
      fieldName: 'company',
      newValue: 'Bestar CCA',
    });

    await request(app.getHttpServer())
      .post('/api/corrections')
      .send({
        targetType: 'CONTAINER',
        containerDestinationId: 'destination-1',
        fieldName: 'company',
        oldValue: null,
        newValue: 'Bestar CCA',
      })
      .expect(400);
  });

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-1',
        importFileId: 'import-1',
        containerNo: 'CSNU8877228',
        dockNo: null,
        company: null,
        status: 'PARSED',
        updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      },
    ];
    const destinations = [
      {
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
      },
    ];
    const corrections: any[] = [];

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      importFile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      containerLine: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      pallet: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      generatedFile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      container: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            containers.find((container) => container.id === where.id) ?? null,
          ),
        ),
        update: jest.fn(({ where, data }) => {
          const record = containers.find(
            (container) => container.id === where.id,
          );
          if (!record) {
            throw new Error(`Container not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      containerDestination: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            destinations.find(
              (destination) => destination.id === where.id,
            ) ?? null,
          ),
        ),
        create: jest.fn(({ data }) => {
          const record = {
            id: `destination-${destinations.length + 1}`,
            ...data,
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          destinations.push(record);
          return Promise.resolve(record);
        }),
        update: jest.fn(({ where, data }) => {
          const record = destinations.find(
            (destination) => destination.id === where.id,
          );
          if (!record) {
            throw new Error(`Destination not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      correctionFeedback: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `correction-${corrections.length + 1}`,
            importFileId: null,
            containerId: null,
            containerLineId: null,
            containerDestinationId: null,
            palletId: null,
            generatedFileId: null,
            correctedById: null,
            note: null,
            ...data,
            createdAt: new Date(
              `2026-06-26T00:0${corrections.length + 1}:00.000Z`,
            ),
            updatedAt: new Date(
              `2026-06-26T00:0${corrections.length + 1}:00.000Z`,
            ),
          };
          corrections.push(record);
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ where, take, skip }) => {
          const filtered = corrections
            .filter((record) =>
              where?.targetType ? record.targetType === where.targetType : true,
            )
            .filter((record) =>
              where?.containerId
                ? record.containerId === where.containerId
                : true,
            )
            .filter((record) =>
              where?.containerDestinationId
                ? record.containerDestinationId ===
                  where.containerDestinationId
                : true,
            )
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime(),
            );
          return Promise.resolve(filtered.slice(skip, skip + take));
        }),
      },
    };

    return mock;
  }
});
