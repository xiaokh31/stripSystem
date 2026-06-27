import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { LoadJobsService } from './load-jobs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LoadJobsService', () => {
  let prisma: any;
  let service: LoadJobsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new LoadJobsService(prisma as PrismaService);
  });

  it('creates a mixed load job with internal container lines and external transfer lines', async () => {
    const result = await service.create({
      loadNo: ' LOAD-2026-001 ',
      truckNo: 'TRK-18',
      carrier: 'Bestar CCA',
      destinationRegion: 'YEG2',
      createdById: 'user-1',
      startedAt: '2026-06-27T10:00:00.000Z',
      scheduledDepartureAt: '2026-06-28T03:00:00.000Z',
      lines: [
        { sourceText: 'ZCSU9024512B转运-12P' },
        { sourceText: 'CSNU8877228-1P' },
        { sourceText: 'EITU9315039-1P' },
      ],
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
      destinationRegion: 'YEG2',
      status: 'IN_PROGRESS',
      canScan: true,
      createdById: 'user-1',
      plannedPalletCount: 2,
      externalPalletCount: 12,
      palletCount: 0,
      eventCount: 0,
    });
    expect(result.startedAt).toBe('2026-06-27T10:00:00.000Z');
    expect(result.scheduledDepartureAt).toBe('2026-06-28T03:00:00.000Z');
    expect(result.lines).toEqual([
      expect.objectContaining({
        id: 'line-1',
        sequence: 1,
        sourceText: 'ZCSU9024512B转运-12P',
        containerNo: 'ZCSU9024512B',
        containerId: null,
        plannedPallets: 12,
        externalTransfer: true,
      }),
      expect.objectContaining({
        id: 'line-2',
        sequence: 2,
        sourceText: 'CSNU8877228-1P',
        containerNo: 'CSNU8877228',
        containerId: 'container-1',
        containerDestinationId: 'destination-1',
        plannedPallets: 1,
        externalTransfer: false,
      }),
      expect.objectContaining({
        id: 'line-3',
        sequence: 3,
        sourceText: 'EITU9315039-1P',
        containerNo: 'EITU9315039',
        containerId: 'container-2',
        containerDestinationId: 'destination-2',
        plannedPallets: 1,
        externalTransfer: false,
      }),
    ]);
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
        destinationRegion: 'YEG2',
        status: 'IN_PROGRESS',
        scheduledDepartureAt: expect.any(Date),
        closedAt: null,
        createdById: 'user-1',
        lines: {
          create: [
            expect.objectContaining({
              sequence: 1,
              containerId: null,
              plannedPallets: 12,
              externalTransfer: true,
            }),
            expect.objectContaining({
              sequence: 2,
              containerId: 'container-1',
              containerDestinationId: 'destination-1',
              plannedPallets: 1,
              externalTransfer: false,
            }),
            expect.objectContaining({
              sequence: 3,
              containerId: 'container-2',
              containerDestinationId: 'destination-2',
              plannedPallets: 1,
              externalTransfer: false,
            }),
          ],
        },
      }),
      include: expect.any(Object),
    });
  });

  it('rejects a load job without plan lines', async () => {
    await expect(
      service.create({
        loadNo: 'LOAD-2026-EMPTY',
        destinationRegion: 'YEG2',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists load jobs by load number and container lines', async () => {
    await service.create({
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      lines: [
        { sourceText: 'ZCSU9024512B转运-12P' },
        { sourceText: 'CSNU8877228-1P' },
        { sourceText: 'EITU9315039-1P' },
      ],
    });
    await service.create({
      loadNo: 'LOAD-2026-002',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-2P' }],
    });

    const result = await service.list({
      containerId: 'container-2',
      status: 'IN_PROGRESS',
      limit: 50,
      offset: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      loadNo: 'LOAD-2026-001',
      plannedPalletCount: 2,
      externalPalletCount: 12,
      status: 'IN_PROGRESS',
      canScan: true,
    });
    expect(prisma.loadJob.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { containerId: 'container-2' },
          { lines: { some: { containerId: 'container-2' } } },
        ],
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
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      createdById: 'user-1',
      lines: [
        { sourceText: 'ZCSU9024512B转运-12P' },
        { sourceText: 'CSNU8877228-1P' },
      ],
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
      plannedPalletCount: 1,
      externalPalletCount: 12,
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
          plannedPalletCount: 1,
          externalPalletCount: 12,
          reason: 'Loaded at dock 3',
          note: 'Seal verified',
        }),
        operatorId: 'user-1',
      }),
    });
  });

  it('rejects closing an already completed load job', async () => {
    await service.create({
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-1P' }],
    });
    await service.close('load-job-1', {});

    await expect(service.close('load-job-1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.palletEvent.create).toHaveBeenCalledTimes(1);
  });

  it('loads planned pallets from multiple containers and blocks pallets beyond the planned line count', async () => {
    await service.create({
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      lines: [
        { sourceText: 'ZCSU9024512B转运-12P' },
        { sourceText: 'CSNU8877228-1P' },
        { sourceText: 'EITU9315039-1P' },
      ],
    });

    const first = await service.scan('load-job-1', {
      qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      deviceId: 'scanner-1',
      operatorId: 'user-1',
    });
    const second = await service.scan('load-job-1', {
      qrPayload: 'SSP1|PALLET|2026-06-27|EITU9315039|YEG2|1/1|PALLET-003',
      deviceId: 'scanner-1',
      operatorId: 'user-1',
    });

    expect(first).toMatchObject({
      result: 'LOADED',
      loadJob: {
        id: 'load-job-1',
        plannedPalletCount: 2,
        externalPalletCount: 12,
        palletCount: 1,
        eventCount: 1,
      },
      pallet: {
        id: 'pallet-1',
        containerId: 'container-1',
        containerNo: 'CSNU8877228',
        palletId: 'PALLET-001',
        status: 'LOADED',
        loadJobId: 'load-job-1',
      },
      progress: {
        totalPallets: 2,
        loadedPallets: 1,
        remainingPallets: 1,
      },
      eventId: 'event-1',
    });
    expect(second).toMatchObject({
      result: 'LOADED',
      pallet: {
        id: 'pallet-3',
        palletId: 'PALLET-003',
        status: 'LOADED',
      },
      progress: {
        totalPallets: 2,
        loadedPallets: 2,
        remainingPallets: 0,
      },
      eventId: 'event-2',
    });
    expect(
      prisma.palletEvent.create.mock.calls[0][0].data.metadata,
    ).toMatchObject({
      loadJobLineId: 'line-2',
    });
    expect(
      prisma.palletEvent.create.mock.calls[1][0].data.metadata,
    ).toMatchObject({
      loadJobLineId: 'line-3',
    });

    await expectHttpErrorCode(
      service.scan('load-job-1', {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
      }),
      'LOAD_JOB_LINE_PALLET_LIMIT_REACHED',
    );
    expect(prisma.pallet.update).toHaveBeenCalledTimes(2);
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['LOADED', 'LOADED', 'INVALID_SCAN']);
  });

  it('splits one container destination across multiple load jobs with part suffixes', async () => {
    const firstJob = await service.create({
      loadNo: 'LOAD-2026-PART-1',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-1P-part1' }],
    });
    const secondJob = await service.create({
      loadNo: 'LOAD-2026-PART-2',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-1P-part2' }],
    });

    expect(firstJob.lines[0]).toMatchObject({
      sourceText: 'CSNU8877228-1P-part1',
      containerNo: 'CSNU8877228',
      containerId: 'container-1',
      containerDestinationId: 'destination-1',
      plannedPallets: 1,
      externalTransfer: false,
    });
    expect(secondJob.lines[0]).toMatchObject({
      sourceText: 'CSNU8877228-1P-part2',
      containerNo: 'CSNU8877228',
      containerId: 'container-1',
      containerDestinationId: 'destination-1',
      plannedPallets: 1,
      externalTransfer: false,
    });

    const firstScan = await service.scan('load-job-1', {
      qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
    });
    const secondScan = await service.scan('load-job-2', {
      qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
    });

    expect(firstScan).toMatchObject({
      result: 'LOADED',
      progress: {
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
      pallet: {
        id: 'pallet-1',
        loadJobId: 'load-job-1',
      },
    });
    expect(secondScan).toMatchObject({
      result: 'LOADED',
      progress: {
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
      pallet: {
        id: 'pallet-2',
        loadJobId: 'load-job-2',
      },
    });
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.metadata?.loadJobLineId,
      ),
    ).toEqual(['line-1', 'line-2']);
  });

  it('returns duplicate for the same load job without loading twice', async () => {
    await service.create({
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-2P' }],
    });

    await service.scan('load-job-1', {
      qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
    });
    const duplicate = await service.scan('load-job-1', {
      qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
    });

    expect(duplicate).toMatchObject({
      result: 'DUPLICATE',
      pallet: {
        id: 'pallet-1',
        status: 'LOADED',
        loadJobId: 'load-job-1',
      },
      progress: {
        totalPallets: 2,
        loadedPallets: 1,
        remainingPallets: 1,
      },
    });
    expect(prisma.pallet.update).toHaveBeenCalledTimes(1);
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['LOADED', 'DUPLICATE_SCAN']);
  });

  it('blocks a pallet loaded by a different load job', async () => {
    await service.create({
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-2P' }],
    });
    await service.create({
      loadNo: 'LOAD-2026-002',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-2P' }],
    });

    await service.scan('load-job-1', {
      qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
    });

    await expectHttpErrorCode(
      service.scan('load-job-2', {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      }),
      'PALLET_ALREADY_LOADED',
    );
    expect(prisma.pallet.update).toHaveBeenCalledTimes(1);
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['LOADED', 'INVALID_SCAN']);
  });

  it('allows a pure external transfer load job but rejects system pallets as not in plan', async () => {
    const result = await service.create({
      loadNo: 'LOAD-2026-XFER',
      destinationRegion: 'YEG2',
      lines: [
        { sourceText: 'ZCSU9024512B转运-12P' },
        { sourceText: 'ZCSU9025231B转运 -2P' },
      ],
    });

    expect(result).toMatchObject({
      containerId: null,
      container: null,
      plannedPalletCount: 0,
      externalPalletCount: 14,
      lines: [
        expect.objectContaining({
          externalTransfer: true,
          plannedPallets: 12,
        }),
        expect.objectContaining({
          externalTransfer: true,
          plannedPallets: 2,
        }),
      ],
    });

    await expectHttpErrorCode(
      service.scan('load-job-1', {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      }),
      'PALLET_NOT_IN_LOAD_PLAN',
    );
    expect(prisma.pallet.update).not.toHaveBeenCalled();
    expect(prisma.palletEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        loadJobId: 'load-job-1',
        eventType: 'INVALID_SCAN',
        exceptionReason: 'PALLET_NOT_IN_LOAD_PLAN',
      }),
    });
  });

  it('rejects scans after the load job is closed', async () => {
    await service.create({
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-1P' }],
    });
    await service.close('load-job-1', {});

    await expect(
      service.scan('load-job-1', {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.pallet.update).not.toHaveBeenCalled();
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['STATUS_CHANGED', 'INVALID_SCAN']);
  });

  it('records invalid QR scans without updating a pallet', async () => {
    await service.create({
      loadNo: 'LOAD-2026-001',
      destinationRegion: 'YEG2',
      lines: [{ sourceText: 'CSNU8877228-1P' }],
    });

    await expect(
      service.scan('load-job-1', {
        qrPayload: 'SSP0|PALLET|old-version|PALLET-001',
        deviceId: 'scanner-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.pallet.update).not.toHaveBeenCalled();
    expect(prisma.palletEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        loadJobId: 'load-job-1',
        eventType: 'INVALID_SCAN',
        scanPayload: 'SSP0|PALLET|old-version|PALLET-001',
        deviceId: 'scanner-1',
        exceptionReason: 'INVALID_QR_PAYLOAD',
      }),
    });
  });

  async function expectHttpErrorCode(
    promise: Promise<unknown>,
    code: string,
  ): Promise<void> {
    try {
      await promise;
      throw new Error(`Expected ${code}`);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({ code });
    }
  }

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-1',
        containerNo: 'CSNU8877228',
      },
      {
        id: 'container-2',
        containerNo: 'EITU9315039',
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
    const destinations = [
      {
        id: 'destination-1',
        containerId: 'container-1',
        destinationCode: 'YEG2',
        destinationType: 'AMAZON_FBA',
      },
      {
        id: 'destination-2',
        containerId: 'container-2',
        destinationCode: 'YEG2',
        destinationType: 'AMAZON_FBA',
      },
    ];
    const pallets = [
      {
        id: 'pallet-1',
        containerDestinationId: 'destination-1',
        palletNo: 1,
        palletId: 'PALLET-001',
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        status: 'LABEL_PRINTED',
        labelPrintedAt: new Date('2026-06-27T09:00:00.000Z'),
        loadedAt: null,
        loadJobId: null,
        createdAt: new Date('2026-06-27T09:00:00.000Z'),
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
      {
        id: 'pallet-2',
        containerDestinationId: 'destination-1',
        palletNo: 2,
        palletId: 'PALLET-002',
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
        status: 'LABEL_PRINTED',
        labelPrintedAt: new Date('2026-06-27T09:00:00.000Z'),
        loadedAt: null,
        loadJobId: null,
        createdAt: new Date('2026-06-27T09:00:00.000Z'),
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
      {
        id: 'pallet-3',
        containerDestinationId: 'destination-2',
        palletNo: 1,
        palletId: 'PALLET-003',
        qrPayload: 'SSP1|PALLET|2026-06-27|EITU9315039|YEG2|1/1|PALLET-003',
        status: 'LABEL_PRINTED',
        labelPrintedAt: new Date('2026-06-27T09:00:00.000Z'),
        loadedAt: null,
        loadJobId: null,
        createdAt: new Date('2026-06-27T09:00:00.000Z'),
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
    ];
    const loadJobs: any[] = [];
    const loadJobLines: any[] = [];
    const events: any[] = [];

    const hydrateLine = (record: any) => ({
      ...record,
      container:
        containers.find((container) => container.id === record.containerId) ??
        null,
    });
    const hydrate = (record: any) => ({
      ...record,
      container:
        containers.find((container) => container.id === record.containerId) ??
        null,
      createdBy: users.find((user) => user.id === record.createdById) ?? null,
      lines: loadJobLines
        .filter((line) => line.loadJobId === record.id)
        .sort((left, right) => left.sequence - right.sequence)
        .map(hydrateLine),
      _count: {
        pallets: pallets.filter((pallet) => pallet.loadJobId === record.id)
          .length,
        events: events.filter((event) => event.loadJobId === record.id).length,
      },
    });
    const hydratePallet = (record: any) => ({
      ...record,
      containerDestination: (() => {
        const destination =
          destinations.find(
            (item) => item.id === record.containerDestinationId,
          ) ?? null;
        if (!destination) {
          return null;
        }

        return {
          ...destination,
          container:
            containers.find(
              (container) => container.id === destination.containerId,
            ) ?? null,
        };
      })(),
    });
    const matchesLoadJobWhere = (record: any, where: any) => {
      if (!where) {
        return true;
      }
      if (where.OR) {
        const matchesOr = where.OR.some((condition: any) => {
          if (condition.containerId) {
            return record.containerId === condition.containerId;
          }
          const lineContainerId = condition.lines?.some?.containerId;
          return lineContainerId
            ? loadJobLines.some(
                (line) =>
                  line.loadJobId === record.id &&
                  line.containerId === lineContainerId,
              )
            : false;
        });
        if (!matchesOr) {
          return false;
        }
      }
      if (where.jobNo && record.jobNo !== where.jobNo) {
        return false;
      }
      if (
        where.destinationRegion &&
        record.destinationRegion !== where.destinationRegion
      ) {
        return false;
      }
      if (where.status && record.status !== where.status) {
        return false;
      }
      return true;
    };
    const matchesPalletWhere = (pallet: any, where: any) => {
      const destination = destinations.find(
        (item) => item.id === pallet.containerDestinationId,
      );

      if (where.status?.not && pallet.status === where.status.not) {
        return false;
      }
      if (where.status && !where.status.not && pallet.status !== where.status) {
        return false;
      }
      if (where.loadJobId && pallet.loadJobId !== where.loadJobId) {
        return false;
      }
      if (
        where.containerDestinationId &&
        pallet.containerDestinationId !== where.containerDestinationId
      ) {
        return false;
      }

      const destinationFilter =
        where.containerDestination?.is ?? where.containerDestination;
      if (destinationFilter?.containerId) {
        if (destination?.containerId !== destinationFilter.containerId) {
          return false;
        }
      }
      if (destinationFilter?.destinationCode) {
        if (
          destination?.destinationCode !== destinationFilter.destinationCode
        ) {
          return false;
        }
      }

      return true;
    };

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'pallet-1' }]),
      container: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            containers.find((container) =>
              where.id
                ? container.id === where.id
                : container.containerNo === where.containerNo,
            ) ?? null,
          ),
        ),
      },
      containerDestination: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            destinations.find((destination) => destination.id === where.id) ??
              null,
          ),
        ),
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            destinations.find(
              (destination) =>
                destination.containerId === where.containerId &&
                destination.destinationCode === where.destinationCode,
            ) ?? null,
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
            containerId: data.containerId ?? null,
            jobNo: data.jobNo ?? null,
            truckNo: data.truckNo ?? null,
            carrier: data.carrier ?? null,
            destinationRegion: data.destinationRegion ?? null,
            status: data.status,
            startedAt: data.startedAt ?? null,
            scheduledDepartureAt: data.scheduledDepartureAt ?? null,
            closedAt: data.closedAt ?? null,
            createdById: data.createdById ?? null,
            createdAt,
            updatedAt: createdAt,
          };
          loadJobs.push(record);
          for (const line of data.lines?.create ?? []) {
            loadJobLines.push({
              id: `line-${loadJobLines.length + 1}`,
              loadJobId: record.id,
              sequence: line.sequence,
              sourceText: line.sourceText ?? null,
              containerNo: line.containerNo ?? null,
              containerId: line.containerId ?? null,
              containerDestinationId: line.containerDestinationId ?? null,
              destinationCode: line.destinationCode ?? null,
              plannedPallets: line.plannedPallets ?? 0,
              externalTransfer: line.externalTransfer ?? false,
              note: line.note ?? null,
              createdAt,
              updatedAt: createdAt,
            });
          }
          return Promise.resolve(hydrate(record));
        }),
        findMany: jest.fn(({ where, take, skip }) => {
          const filtered = loadJobs
            .filter((record) => matchesLoadJobWhere(record, where))
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
      pallet: {
        findFirst: jest.fn(({ where }) => {
          const record = pallets.find((pallet) =>
            where.OR.some(
              (condition: any) =>
                condition.qrPayload === pallet.qrPayload ||
                condition.palletId === pallet.palletId,
            ),
          );
          return Promise.resolve(record ? hydratePallet(record) : null);
        }),
        findUnique: jest.fn(({ where }) => {
          const record = pallets.find((pallet) => pallet.id === where.id);
          return Promise.resolve(record ? hydratePallet(record) : null);
        }),
        update: jest.fn(({ where, data }) => {
          const record = pallets.find((pallet) => pallet.id === where.id);
          if (!record) {
            throw new Error(`Pallet not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-27T11:00:00.000Z'),
          });
          return Promise.resolve(hydratePallet(record));
        }),
        count: jest.fn(({ where }) =>
          Promise.resolve(
            pallets.filter((pallet) => matchesPalletWhere(pallet, where))
              .length,
          ),
        ),
      },
      palletEvent: {
        create: jest.fn(({ data }) => {
          const occurredAt =
            data.occurredAt ?? new Date('2026-06-27T11:00:00.000Z');
          const record = {
            id: `event-${events.length + 1}`,
            palletId: null,
            ...data,
            occurredAt,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          };
          events.push(record);
          return Promise.resolve(record);
        }),
      },
    };

    return mock;
  }
});
