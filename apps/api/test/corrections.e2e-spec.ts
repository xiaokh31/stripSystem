import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  authorizedRequest,
  configureAuthTestEnv,
  installAuthMock,
  officeAuthHeader,
} from './auth-test-helpers';

interface CorrectionBody {
  id: string;
  targetType: string;
  containerId: string | null;
  containerDestinationId: string | null;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  correctedById: string | null;
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
    configureAuthTestEnv();
    prisma = createPrismaMock();
    installAuthMock(prisma);

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
    const response = await authorizedRequest(app, officeAuthHeader())
      .patch('/api/container-destinations/destination-1')
      .send({
        manualPallets: 9,
        reason: 'Office correction',
        correctionNote: 'Customer confirmed revised pallet count',
        correctedById: 'spoofed-user',
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
    expect(
      response.body.corrections.every(
        (item: CorrectionBody) => item.correctedById === 'auth-office',
      ),
    ).toBe(true);

    const list = await authorizedRequest(app, officeAuthHeader())
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
    expect(
      body.items.every((item) => item.correctedById === 'auth-office'),
    ).toBe(true);
  });

  it('updates destination actual note only and lists audit rows', async () => {
    const response = await authorizedRequest(app, officeAuthHeader())
      .patch('/api/container-destinations/destination-1')
      .send({
        correctionNote: 'Office saved actual unloading note',
        note: '  Revised actual note  ',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      containerDestination: {
        id: 'destination-1',
        note: 'Revised actual note',
      },
      corrections: [
        expect.objectContaining({
          containerId: 'container-1',
          containerDestinationId: 'destination-1',
          correctedById: 'auth-office',
          fieldName: 'note',
          oldValue: null,
          newValue: 'Revised actual note',
          note: 'Office saved actual unloading note',
        }),
      ],
    });

    const list = await authorizedRequest(app, officeAuthHeader())
      .get('/api/corrections?containerDestinationId=destination-1')
      .expect(200);
    const body = list.body as CorrectionListBody;

    expect(body.items.map((item) => item.fieldName)).toEqual(['note']);
  });

  it('updates container fields and creates correction feedback', async () => {
    const response = await authorizedRequest(app)
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

  it('creates a manual unloading report container with destinations and audit feedback', async () => {
    const response = await authorizedRequest(app)
      .post('/api/containers/manual')
      .send({
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
      })
      .expect(201);

    expect(response.body).toMatchObject({
      container: {
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
            manualPallets: 4,
            finalPallets: 4,
          }),
          expect.objectContaining({
            destinationCode: 'YVR2',
            totalCartons: 12,
            manualPallets: 2,
            finalPallets: 2,
          }),
        ],
      },
    });
    expect(response.body.corrections.map((item) => item.fieldName)).toEqual([
      'manualContainer',
      'manualContainerDestination',
      'manualContainerDestination',
    ]);

    const detail = await authorizedRequest(app)
      .get(`/api/containers/${response.body.container.id}`)
      .expect(200);

    expect(detail.body).toMatchObject({
      id: response.body.container.id,
      importFileId: null,
      containerNo: 'MANU1234567',
      parserVersion: 'manual-entry-v1',
      destinations: [
        expect.objectContaining({
          destinationCode: 'YEG1',
          calculatedPallets: 6,
          manualPallets: 4,
          finalPallets: 4,
        }),
        expect.objectContaining({
          destinationCode: 'YVR2',
          calculatedPallets: 1,
          manualPallets: 2,
          finalPallets: 2,
        }),
      ],
    });

    const corrections = await authorizedRequest(app)
      .get(`/api/corrections?containerId=${response.body.container.id}`)
      .expect(200);
    const correctionsBody = corrections.body as CorrectionListBody;

    expect(correctionsBody.items.map((item) => item.fieldName)).toEqual([
      'manualContainerDestination',
      'manualContainerDestination',
      'manualContainer',
    ]);
    expect(
      correctionsBody.items.every(
        (item) => item.containerId === response.body.container.id,
      ),
    ).toBe(true);
  });

  it('creates a manual destination for actual unloading data and creates audit feedback', async () => {
    const response = await authorizedRequest(app)
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

  it('deletes a destination and creates audit feedback', async () => {
    const response = await authorizedRequest(app, officeAuthHeader())
      .delete('/api/container-destinations/destination-1')
      .expect(200);

    expect(response.body).toMatchObject({
      containerDestination: {
        id: 'destination-1',
        containerId: 'container-1',
        destinationCode: 'YYZ',
      },
      corrections: [
        expect.objectContaining({
          containerId: 'container-1',
          containerDestinationId: 'destination-1',
          fieldName: 'containerDestination',
          newValue: null,
        }),
      ],
    });

    const detail = await authorizedRequest(app)
      .get('/api/containers/container-1')
      .expect(200);

    expect(detail.body.destinations).toEqual([]);
  });

  it('creates and lists standalone correction feedback with target validation', async () => {
    const created = await authorizedRequest(app)
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

    await authorizedRequest(app)
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
    let manualDestinationCount = 0;
    containers[0].destinations = [destinations[0]];

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
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      generatedFile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      container: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `container-${containers.length + 1}`,
            importFileId: null,
            ...data,
            destinations: [],
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          containers.push(record);
          return Promise.resolve(record);
        }),
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
            destinations.find((destination) => destination.id === where.id) ??
              null,
          ),
        ),
        create: jest.fn(({ data }) => {
          manualDestinationCount += 1;
          const record = {
            id: `destination-created-${manualDestinationCount}`,
            ...data,
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          };
          destinations.push(record);
          const container = containers.find(
            (item) => item.id === data.containerId,
          );
          container?.destinations.push(record);
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
        delete: jest.fn(({ where }) => {
          const index = destinations.findIndex(
            (destination) => destination.id === where.id,
          );
          if (index < 0) {
            throw new Error(`Destination not found: ${where.id}`);
          }
          const [deleted] = destinations.splice(index, 1);
          const container = containers.find(
            (item) => item.id === deleted.containerId,
          );
          if (container) {
            container.destinations = container.destinations.filter(
              (destination: any) => destination.id !== where.id,
            );
          }
          return Promise.resolve(deleted);
        }),
      },
      loadJobLine: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
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
                ? record.containerDestinationId === where.containerDestinationId
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
