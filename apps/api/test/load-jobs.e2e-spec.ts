import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

interface LoadJobBody {
  id: string;
  containerId: string;
  container: {
    id: string;
    containerNo: string;
  } | null;
  loadNo: string;
  truckNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: string;
  canScan: boolean;
  closedAt: string | null;
  eventCount: number;
}

interface LoadJobListBody {
  items: LoadJobBody[];
  limit: number;
  offset: number;
}

describe('LoadJobsController (e2e)', () => {
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

  it('creates, queries, and closes a load job', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/load-jobs')
      .send({
        containerId: 'container-1',
        loadNo: 'LOAD-2026-001',
        truckNo: 'TRK-18',
        carrier: 'Bestar CCA',
        destinationRegion: 'YYZ',
        createdById: 'user-1',
        startedAt: '2026-06-27T10:00:00.000Z',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      id: 'load-job-1',
      containerId: 'container-1',
      loadNo: 'LOAD-2026-001',
      status: 'IN_PROGRESS',
      canScan: true,
      closedAt: null,
      eventCount: 0,
    });

    const list = await request(app.getHttpServer())
      .get('/api/load-jobs?status=IN_PROGRESS')
      .expect(200);
    const listBody = list.body as LoadJobListBody;

    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0]).toMatchObject({
      id: 'load-job-1',
      loadNo: 'LOAD-2026-001',
      canScan: true,
    });

    const detail = await request(app.getHttpServer())
      .get('/api/load-jobs/load-job-1')
      .expect(200);

    expect(detail.body).toMatchObject({
      id: 'load-job-1',
      truckNo: 'TRK-18',
      carrier: 'Bestar CCA',
      destinationRegion: 'YYZ',
    });

    const closed = await request(app.getHttpServer())
      .post('/api/load-jobs/load-job-1/close')
      .send({
        operatorId: 'user-1',
        reason: 'Loaded at dock 3',
      })
      .expect(201);

    expect(closed.body).toMatchObject({
      id: 'load-job-1',
      status: 'COMPLETED',
      canScan: false,
      eventCount: 1,
    });
    expect(closed.body.closedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/api/load-jobs/load-job-1/close')
      .send({})
      .expect(409);
  });

  it('validates create body and returns explicit missing container errors', async () => {
    await request(app.getHttpServer())
      .post('/api/load-jobs')
      .send({
        containerId: 'container-1',
      })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post('/api/load-jobs')
      .send({
        containerId: 'missing-container',
        loadNo: 'LOAD-2026-404',
      })
      .expect(404);

    expect(response.body).toMatchObject({
      code: 'LOAD_JOB_CONTAINER_NOT_FOUND',
    });
  });

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-1',
        containerNo: 'CSNU8877228',
      },
    ];
    const users = [
      {
        id: 'user-1',
        email: 'office@example.test',
        name: 'Office User',
        role: 'OFFICE',
      },
    ];
    const loadJobs: any[] = [];
    const events: any[] = [];

    const hydrate = (record: any) => ({
      ...record,
      container:
        containers.find((container) => container.id === record.containerId) ??
        null,
      createdBy: users.find((user) => user.id === record.createdById) ?? null,
      _count: {
        pallets: 0,
        events: events.filter((event) => event.loadJobId === record.id).length,
      },
    });

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      container: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            containers.find((container) => container.id === where.id) ?? null,
          ),
        ),
      },
      user: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(users.find((user) => user.id === where.id) ?? null),
        ),
      },
      loadJob: {
        create: jest.fn(({ data }) => {
          const createdAt = new Date(
            `2026-06-27T10:0${loadJobs.length}:00.000Z`,
          );
          const record = {
            id: `load-job-${loadJobs.length + 1}`,
            containerId: data.containerId,
            jobNo: data.jobNo ?? null,
            truckNo: data.truckNo ?? null,
            carrier: data.carrier ?? null,
            destinationRegion: data.destinationRegion ?? null,
            status: data.status,
            startedAt: data.startedAt ?? null,
            closedAt: data.closedAt ?? null,
            createdById: data.createdById ?? null,
            createdAt,
            updatedAt: createdAt,
          };
          loadJobs.push(record);
          return Promise.resolve(hydrate(record));
        }),
        findMany: jest.fn(({ where, take, skip }) => {
          const filtered = loadJobs
            .filter((record) =>
              where?.containerId
                ? record.containerId === where.containerId
                : true,
            )
            .filter((record) =>
              where?.jobNo ? record.jobNo === where.jobNo : true,
            )
            .filter((record) =>
              where?.destinationRegion
                ? record.destinationRegion === where.destinationRegion
                : true,
            )
            .filter((record) =>
              where?.status ? record.status === where.status : true,
            )
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime(),
            );

          return Promise.resolve(
            filtered.slice(skip, skip + take).map(hydrate),
          );
        }),
        findUnique: jest.fn(({ where }) => {
          const record = loadJobs.find((item) => item.id === where.id);
          return Promise.resolve(record ? hydrate(record) : null);
        }),
        update: jest.fn(({ where, data }) => {
          const record = loadJobs.find((item) => item.id === where.id);
          if (!record) {
            throw new Error(`Load job not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-27T11:00:00.000Z'),
          });
          return Promise.resolve(hydrate(record));
        }),
      },
      palletEvent: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `event-${events.length + 1}`,
            palletId: null,
            ...data,
            createdAt: data.occurredAt,
            updatedAt: data.occurredAt,
          };
          events.push(record);
          return Promise.resolve(record);
        }),
      },
    };

    return mock;
  }
});
