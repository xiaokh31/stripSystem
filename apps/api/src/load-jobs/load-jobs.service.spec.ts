import { ConflictException } from '@nestjs/common';
import { LoadJobsService } from './load-jobs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LoadJobsService', () => {
  let prisma: any;
  let service: LoadJobsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new LoadJobsService(prisma as PrismaService);
  });

  it('creates an open load job for a real container record', async () => {
    const result = await service.create({
      containerId: 'container-1',
      loadNo: ' LOAD-2026-001 ',
      truckNo: 'TRK-18',
      carrier: 'Bestar CCA',
      destinationRegion: 'YYZ',
      createdById: 'user-1',
      startedAt: '2026-06-27T10:00:00.000Z',
    });

    expect(result).toMatchObject({
      id: 'load-job-1',
      containerId: 'container-1',
      container: {
        id: 'container-1',
        containerNo: 'CSNU8877228',
      },
      loadNo: 'LOAD-2026-001',
      truckNo: 'TRK-18',
      carrier: 'Bestar CCA',
      destinationRegion: 'YYZ',
      status: 'IN_PROGRESS',
      canScan: true,
      createdById: 'user-1',
      palletCount: 0,
      eventCount: 0,
    });
    expect(result.startedAt).toBe('2026-06-27T10:00:00.000Z');
    expect(prisma.container.findUnique).toHaveBeenCalledWith({
      where: { id: 'container-1' },
      select: { id: true },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true },
    });
    expect(prisma.loadJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        containerId: 'container-1',
        jobNo: 'LOAD-2026-001',
        truckNo: 'TRK-18',
        carrier: 'Bestar CCA',
        destinationRegion: 'YYZ',
        status: 'IN_PROGRESS',
        closedAt: null,
        createdById: 'user-1',
      }),
      include: expect.any(Object),
    });
  });

  it('lists load jobs with status and load number filters', async () => {
    await service.create({
      containerId: 'container-1',
      loadNo: 'LOAD-2026-001',
    });
    await service.create({
      containerId: 'container-1',
      loadNo: 'LOAD-2026-002',
    });

    const result = await service.list({
      loadNo: 'LOAD-2026-002',
      status: 'IN_PROGRESS',
      limit: 50,
      offset: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      loadNo: 'LOAD-2026-002',
      status: 'IN_PROGRESS',
      canScan: true,
    });
    expect(prisma.loadJob.findMany).toHaveBeenCalledWith({
      where: {
        jobNo: 'LOAD-2026-002',
        status: 'IN_PROGRESS',
      },
      include: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });

  it('closes an open load job and writes a pallet event audit record', async () => {
    await service.create({
      containerId: 'container-1',
      loadNo: 'LOAD-2026-001',
      createdById: 'user-1',
    });

    const result = await service.close('load-job-1', {
      operatorId: 'user-1',
      reason: 'Loaded at dock 3',
      note: 'Seal verified',
    });

    expect(result).toMatchObject({
      id: 'load-job-1',
      status: 'COMPLETED',
      canScan: false,
      eventCount: 1,
    });
    expect(result.closedAt).toEqual(expect.any(String));
    expect(prisma.palletEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        loadJobId: 'load-job-1',
        eventType: 'STATUS_CHANGED',
        metadata: expect.objectContaining({
          action: 'LOAD_JOB_CLOSED',
          loadJobId: 'load-job-1',
          loadNo: 'LOAD-2026-001',
          fromStatus: 'IN_PROGRESS',
          toStatus: 'COMPLETED',
          reason: 'Loaded at dock 3',
          note: 'Seal verified',
        }),
        operatorId: 'user-1',
      }),
    });
    expect(prisma.loadJob.update).toHaveBeenCalledWith({
      where: { id: 'load-job-1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        closedAt: expect.any(Date),
      }),
      include: expect.any(Object),
    });
  });

  it('rejects closing an already completed load job', async () => {
    await service.create({
      containerId: 'container-1',
      loadNo: 'LOAD-2026-001',
    });
    await service.close('load-job-1', {});

    await expect(service.close('load-job-1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.palletEvent.create).toHaveBeenCalledTimes(1);
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
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            loadJobs.find((record) => record.id === where.id)
              ? hydrate(loadJobs.find((record) => record.id === where.id))
              : null,
          ),
        ),
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
