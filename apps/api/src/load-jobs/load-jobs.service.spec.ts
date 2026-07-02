import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { LoadJobsService } from './load-jobs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LoadJobsService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['load_jobs.create', 'load_jobs.update'],
  };
  const warehouseActor = {
    id: 'auth-warehouse',
    email: 'warehouse@example.com',
    name: 'Warehouse User',
    roles: ['WAREHOUSE'],
    permissions: ['scan.create', 'scan.reverse'],
  };
  let prisma: any;
  let service: LoadJobsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new LoadJobsService(prisma as PrismaService);
  });

  it('creates a mixed load job with internal container lines and external transfer lines', async () => {
    const result = await service.create(
      {
        loadNo: ' LOAD-2026-001 ',
        truckNo: 'TRK-18',
        dockNo: 'D3',
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
      },
      officeActor,
    );

    expect(result).toMatchObject({
      id: 'load-job-1',
      containerId: 'container-1',
      container: {
        id: 'container-1',
        containerNo: 'CSNU8877228',
      },
      loadNo: 'LOAD-2026-001',
      truckNo: 'TRK-18',
      dockNo: 'D3',
      carrier: 'Bestar CCA',
      destinationRegion: 'YEG2',
      status: 'PLANNED',
      canScan: false,
      createdById: 'auth-office',
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
    expect(prisma.user.findUnique).not.toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true },
    });
    expect(prisma.loadJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        containerId: 'container-1',
        jobNo: 'LOAD-2026-001',
        truckNo: 'TRK-18',
        dockNo: 'D3',
        carrier: 'Bestar CCA',
        destinationRegion: 'YEG2',
        status: 'PLANNED',
        scheduledDepartureAt: expect.any(Date),
        closedAt: null,
        createdById: 'auth-office',
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
      service.create(
        {
          loadNo: 'LOAD-2026-EMPTY',
          destinationRegion: 'YEG2',
        },
        officeActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects plan line destinations that do not match the destination region', async () => {
    await expectHttpErrorCode(
      service.create(
        {
          loadNo: 'LOAD-2026-MISMATCH',
          destinationRegion: 'YEG2',
          lines: [
            {
              containerNo: 'CSNU8877228',
              destinationCode: 'YYC1',
              plannedPallets: 1,
            },
          ],
        },
        officeActor,
      ),
      'LOAD_JOB_LINE_DESTINATION_REGION_MISMATCH',
    );
  });

  it('updates planned load jobs, starts loading manually, and only deletes planned jobs', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );

    const started = await service.update(
      'load-job-1',
      {
        dockNo: 'D5',
        status: 'IN_PROGRESS',
        truckNo: 'TRK-99',
      },
      officeActor,
    );

    expect(started).toMatchObject({
      dockNo: 'D5',
      status: 'IN_PROGRESS',
      canScan: true,
      truckNo: 'TRK-99',
      eventCount: 1,
    });
    await expect(
      service.delete('load-job-1', officeActor),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.create(
      {
        loadNo: 'LOAD-2026-002',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'EITU9315039-1P' }],
      },
      officeActor,
    );
    const deleted = await service.delete('load-job-2', officeActor);

    expect(deleted).toMatchObject({
      id: 'load-job-2',
      status: 'PLANNED',
    });
    expect(prisma.palletEvent.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        loadJobId: 'load-job-2',
        eventType: 'STATUS_CHANGED',
        operatorId: 'auth-office',
        metadata: expect.objectContaining({
          action: 'LOAD_JOB_DELETED',
          loadJobId: 'load-job-2',
        }),
      }),
    });
  });

  it('requires dock number before completing a load job', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );

    await expectHttpErrorCode(
      service.update('load-job-1', { status: 'COMPLETED' }, officeActor),
      'LOAD_JOB_DOCK_NO_REQUIRED_FOR_COMPLETED',
    );
  });

  it('lists load jobs by load number and container lines', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [
          { sourceText: 'ZCSU9024512B转运-12P' },
          { sourceText: 'CSNU8877228-1P' },
          { sourceText: 'EITU9315039-1P' },
        ],
      },
      officeActor,
    );
    await service.create(
      {
        loadNo: 'LOAD-2026-002',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      },
      officeActor,
    );

    const result = await service.list({
      containerId: 'container-2',
      status: 'PLANNED',
      limit: 50,
      offset: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      loadNo: 'LOAD-2026-001',
      plannedPalletCount: 2,
      externalPalletCount: 12,
      status: 'PLANNED',
      canScan: false,
    });
    expect(prisma.loadJob.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { containerId: 'container-2' },
          { lines: { some: { containerId: 'container-2' } } },
        ],
        status: 'PLANNED',
      },
      include: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });

  it('closes an open load job and writes a pallet event audit record', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        createdById: 'user-1',
        lines: [
          { sourceText: 'ZCSU9024512B转运-12P' },
          { sourceText: 'CSNU8877228-1P' },
        ],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');

    const result = await service.close(
      'load-job-1',
      {
        dockNo: 'D3',
        operatorId: 'user-1',
        reason: 'Loaded at dock 3',
        note: 'Seal verified',
      },
      officeActor,
    );

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
        operatorId: 'auth-office',
      }),
    });
  });

  it('returns completed-by user details from the load job completion event', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');

    const closed = await service.close(
      'load-job-1',
      { dockNo: 'D3' },
      warehouseActor,
    );

    expect(closed).toMatchObject({
      id: 'load-job-1',
      status: 'COMPLETED',
      completedById: 'auth-warehouse',
      completedBy: {
        id: 'auth-warehouse',
        email: 'warehouse@example.test',
        name: 'Warehouse User',
        role: 'WAREHOUSE',
      },
    });
    expect(closed.completedAt).toEqual(expect.any(String));
  });

  it('lists the current operator completed history with loaded pallet details', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        truckNo: 'TRK-9',
        dockNo: 'D3',
        carrier: 'Bestar CCA',
        destinationRegion: 'YEG2',
        scheduledDepartureAt: '2026-06-27T21:00:00.000Z',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');
    await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      },
      warehouseActor,
    );
    await service.close('load-job-1', { dockNo: 'D3' }, warehouseActor);

    const history = await service.listOperatorHistory(warehouseActor, {
      limit: 25,
      offset: 0,
    });

    expect(history).toMatchObject({
      limit: 25,
      offset: 0,
      items: [
        {
          id: 'load-job-1',
          loadNo: 'LOAD-2026-001',
          destinationRegion: 'YEG2',
          truckNo: 'TRK-9',
          dockNo: 'D3',
          carrier: 'Bestar CCA',
          scheduledDepartureAt: '2026-06-27T21:00:00.000Z',
          completedById: 'auth-warehouse',
          totalPallets: 1,
          pallets: [
            {
              containerNo: 'CSNU8877228',
              destinationCode: 'YEG2',
              palletId: 'PALLET-001',
              status: 'LOADED',
            },
          ],
        },
      ],
    });
  });

  it('rejects closing an already completed load job', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );
    await service.close('load-job-1', { dockNo: 'D3' }, officeActor);

    await expect(
      service.close('load-job-1', {}, officeActor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.palletEvent.create).toHaveBeenCalledTimes(1);
  });

  it('loads planned pallets from multiple containers and blocks pallets beyond the planned line count', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [
          { sourceText: 'ZCSU9024512B转运-12P' },
          { sourceText: 'CSNU8877228-1P' },
          { sourceText: 'EITU9315039-1P' },
        ],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');

    const first = await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        deviceId: 'scanner-1',
        operatorId: 'user-1',
      },
      warehouseActor,
    );
    const second = await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|EITU9315039|YEG2|1/1|PALLET-003',
        deviceId: 'scanner-1',
        operatorId: 'user-1',
      },
      warehouseActor,
    );

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
    expect(
      prisma.palletEvent.create.mock.calls
        .slice(0, 2)
        .map((call) => call[0].data.operatorId),
    ).toEqual(['auth-warehouse', 'auth-warehouse']);

    await expectHttpErrorCode(
      service.scan(
        'load-job-1',
        {
          qrPayload:
            'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
        },
        warehouseActor,
      ),
      'LOAD_JOB_LINE_PALLET_LIMIT_REACHED',
    );
    expect(prisma.pallet.update).toHaveBeenCalledTimes(2);
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['LOADED', 'LOADED', 'INVALID_SCAN']);
    expect(prisma.container.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'container-1' },
      data: { status: 'LOADING_IN_PROGRESS' },
    });
    expect(prisma.container.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'container-2' },
      data: { status: 'LOADED' },
    });
  });

  it('splits one container destination across multiple load jobs with part suffixes', async () => {
    const firstJob = await service.create(
      {
        loadNo: 'LOAD-2026-PART-1',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P-part1' }],
      },
      officeActor,
    );
    const secondJob = await service.create(
      {
        loadNo: 'LOAD-2026-PART-2',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P-part2' }],
      },
      officeActor,
    );

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
    await openLoadJobForScanning('load-job-1');
    await openLoadJobForScanning('load-job-2');

    const firstScan = await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      },
      warehouseActor,
    );
    const secondScan = await service.scan(
      'load-job-2',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
      },
      warehouseActor,
    );

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

  it('allows leftover internal-cycle pallets from an underloaded completed job to load in a future job', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-FIRST',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      },
      officeActor,
    );
    await service.create(
      {
        loadNo: 'LOAD-2026-FUTURE',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');

    const firstScan = await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      },
      warehouseActor,
    );
    const closedFirstJob = await service.close(
      'load-job-1',
      { dockNo: 'D3' },
      warehouseActor,
    );

    expect(firstScan).toMatchObject({
      progress: {
        totalPallets: 2,
        loadedPallets: 1,
        remainingPallets: 1,
      },
    });
    expect(closedFirstJob).toMatchObject({
      status: 'COMPLETED',
      canScan: false,
    });

    await openLoadJobForScanning('load-job-2');
    const futureScan = await service.scan(
      'load-job-2',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
      },
      warehouseActor,
    );

    expect(futureScan).toMatchObject({
      result: 'LOADED',
      loadJob: {
        id: 'load-job-2',
        plannedPalletCount: 1,
        palletCount: 1,
      },
      pallet: {
        id: 'pallet-2',
        palletId: 'PALLET-002',
        loadJobId: 'load-job-2',
        status: 'LOADED',
      },
      progress: {
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
    });
    expect(prisma.pallet.update).toHaveBeenCalledTimes(2);
  });

  it('returns duplicate for the same load job without loading twice', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');

    await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      },
      warehouseActor,
    );
    const duplicate = await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      },
      warehouseActor,
    );

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

  it('reverses a loaded pallet only with explicit confirmation and audit reason', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');
    const scan = await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        deviceId: 'scanner-1',
        operatorId: 'user-1',
      },
      warehouseActor,
    );
    const loadedBeforeReverse = await service.listLoadedPallets('load-job-1');

    expect(loadedBeforeReverse).toMatchObject({
      items: [
        {
          id: 'pallet-1',
          palletId: 'PALLET-001',
          status: 'LOADED',
          loadJobId: 'load-job-1',
        },
      ],
    });

    await expectHttpErrorCode(
      service.reverseScan(
        'load-job-1',
        {
          confirm: false,
          palletRecordId: scan.pallet.id,
          reason: 'Need to combine pallets',
        },
        warehouseActor,
      ),
      'LOAD_JOB_REVERSE_SCAN_CONFIRMATION_REQUIRED',
    );

    const reversed = await service.reverseScan(
      'load-job-1',
      {
        confirm: true,
        deviceId: 'mobile-camera',
        operatorId: 'user-1',
        palletRecordId: scan.pallet.id,
        reason: 'Need to combine pallets',
      },
      warehouseActor,
    );

    expect(reversed).toMatchObject({
      result: 'REMOVED',
      pallet: {
        id: 'pallet-1',
        status: 'LABEL_PRINTED',
        loadJobId: null,
        loadedAt: null,
      },
      progress: {
        totalPallets: 2,
        loadedPallets: 0,
        remainingPallets: 2,
      },
      eventId: 'event-2',
    });
    await expect(service.listLoadedPallets('load-job-1')).resolves.toEqual({
      items: [],
    });
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['LOADED', 'STATUS_CHANGED']);
    expect(prisma.palletEvent.create.mock.calls[1][0].data).toMatchObject({
      eventType: 'STATUS_CHANGED',
      fromStatus: 'LOADED',
      toStatus: 'LABEL_PRINTED',
      operatorId: 'auth-warehouse',
      exceptionReason: 'LOAD_JOB_SCAN_REVERSED',
      metadata: {
        action: 'PALLET_SCAN_REVERSED',
        reason: 'Need to combine pallets',
        previousLoadJobId: 'load-job-1',
        businessPalletId: 'PALLET-001',
      },
    });
    expect(prisma.pallet.update).toHaveBeenLastCalledWith({
      where: { id: 'pallet-1' },
      data: {
        status: 'LABEL_PRINTED',
        loadedAt: null,
        loadJobId: null,
      },
      include: expect.any(Object),
    });
    expect(prisma.container.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'container-1' },
      data: { status: 'LOADING_IN_PROGRESS' },
    });
    expect(prisma.container.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'container-1' },
      data: { status: 'LABELS_GENERATED' },
    });
  });

  it('blocks a pallet loaded by a different load job', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      },
      officeActor,
    );
    await service.create(
      {
        loadNo: 'LOAD-2026-002',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');
    await openLoadJobForScanning('load-job-2');

    await service.scan(
      'load-job-1',
      {
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      },
      warehouseActor,
    );

    await expectHttpErrorCode(
      service.scan(
        'load-job-2',
        {
          qrPayload:
            'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        },
        warehouseActor,
      ),
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
    const result = await service.create(
      {
        loadNo: 'LOAD-2026-XFER',
        destinationRegion: 'YEG2',
        lines: [
          { sourceText: 'ZCSU9024512B转运-12P' },
          { sourceText: 'ZCSU9025231B转运 -2P' },
        ],
      },
      officeActor,
    );

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
    await openLoadJobForScanning('load-job-1');

    await expectHttpErrorCode(
      service.scan(
        'load-job-1',
        {
          qrPayload:
            'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        },
        warehouseActor,
      ),
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
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );
    await service.close('load-job-1', { dockNo: 'D3' }, officeActor);

    await expect(
      service.scan(
        'load-job-1',
        {
          qrPayload:
            'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        },
        warehouseActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.pallet.update).not.toHaveBeenCalled();
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['STATUS_CHANGED', 'INVALID_SCAN']);
  });

  it('records invalid QR scans without updating a pallet', async () => {
    await service.create(
      {
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      },
      officeActor,
    );
    await openLoadJobForScanning('load-job-1');

    await expect(
      service.scan(
        'load-job-1',
        {
          qrPayload: 'SSP0|PALLET|old-version|PALLET-001',
          deviceId: 'scanner-1',
        },
        warehouseActor,
      ),
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

  async function openLoadJobForScanning(id: string): Promise<void> {
    await service.update(id, { status: 'IN_PROGRESS' }, officeActor);
    prisma.palletEvent.create.mockClear();
    prisma.__events.length = 0;
  }

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-1',
        containerNo: 'CSNU8877228',
        status: 'LABELS_GENERATED',
      },
      {
        id: 'container-2',
        containerNo: 'EITU9315039',
        status: 'LABELS_GENERATED',
      },
    ];
    const users = [
      {
        id: 'user-1',
        email: 'office@example.test',
        name: 'Office User',
        role: 'OFFICE',
      },
      {
        id: 'auth-warehouse',
        email: 'warehouse@example.test',
        name: 'Warehouse User',
        role: 'WAREHOUSE',
      },
      {
        id: 'auth-office',
        email: 'office-auth@example.test',
        name: 'Office Auth',
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
      pallets: pallets
        .filter((pallet) => pallet.loadJobId === record.id)
        .map(hydratePallet),
      events: events
        .filter((event) => event.loadJobId === record.id)
        .sort(
          (left, right) => timeMs(right.occurredAt) - timeMs(left.occurredAt),
        )
        .map((event) => ({
          ...event,
          operator: users.find((user) => user.id === event.operatorId) ?? null,
        })),
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
      const eventFilter = where.events?.some;
      if (eventFilter) {
        const matchesEvent = events.some((event) => {
          if (event.loadJobId !== record.id) {
            return false;
          }
          if (
            eventFilter.eventType &&
            event.eventType !== eventFilter.eventType
          ) {
            return false;
          }
          if (
            eventFilter.operatorId &&
            event.operatorId !== eventFilter.operatorId
          ) {
            return false;
          }
          return true;
        });

        if (!matchesEvent) {
          return false;
        }
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
    const timeMs = (value: unknown): number =>
      value instanceof Date ? value.getTime() : 0;

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
        update: jest.fn(({ where, data }) => {
          const record = containers.find(
            (container) => container.id === where.id,
          );
          if (!record) {
            throw new Error(`Container not found: ${where.id}`);
          }
          Object.assign(record, data);
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
            dockNo: data.dockNo ?? null,
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
          const { lines, ...recordData } = data;
          Object.assign(record, recordData, {
            updatedAt: new Date('2026-06-27T11:00:00.000Z'),
          });
          if (lines?.deleteMany) {
            for (let index = loadJobLines.length - 1; index >= 0; index -= 1) {
              if (loadJobLines[index].loadJobId === record.id) {
                loadJobLines.splice(index, 1);
              }
            }
          }
          for (const line of lines?.create ?? []) {
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
              createdAt: new Date('2026-06-27T11:00:00.000Z'),
              updatedAt: new Date('2026-06-27T11:00:00.000Z'),
            });
          }
          return Promise.resolve(hydrate(record));
        }),
        delete: jest.fn(({ where }) => {
          const index = loadJobs.findIndex((item) => item.id === where.id);
          if (index < 0) {
            throw new Error(`Load job not found: ${where.id}`);
          }
          const [record] = loadJobs.splice(index, 1);
          for (
            let lineIndex = loadJobLines.length - 1;
            lineIndex >= 0;
            lineIndex -= 1
          ) {
            if (loadJobLines[lineIndex].loadJobId === record.id) {
              loadJobLines.splice(lineIndex, 1);
            }
          }
          return Promise.resolve(hydrate(record));
        }),
      },
      pallet: {
        findMany: jest.fn(({ where }) => {
          const filtered = pallets
            .filter((pallet) => matchesPalletWhere(pallet, where))
            .sort((left, right) => {
              const loadedDelta =
                timeMs(right.loadedAt) - timeMs(left.loadedAt);

              return loadedDelta || left.palletNo - right.palletNo;
            });

          return Promise.resolve(filtered.map(hydratePallet));
        }),
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

    mock.__events = events;

    return mock;
  }
});
