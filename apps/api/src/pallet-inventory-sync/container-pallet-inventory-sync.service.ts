import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  ContainerStatus,
  PalletEventType,
  PalletStatus,
} from '../generated/prisma/enums';
import {
  lockContainerDestinationRows,
  lockContainerRow,
  lockPalletRows,
} from '../common/container-pallet-lock';
import { effectiveContainerStatus } from '../common/container-lifecycle';
import { buildPalletIdentityDraft } from '../common/pallet-identity';
import { operationalLocalDate } from '../common/operational-time';

const INVENTORY_SYNC_SOURCE = 'unloading-completion-inventory-sync';

interface SyncPalletRecord {
  id: string;
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: Date | string | null;
  loadedAt: Date | string | null;
  loadJobId: string | null;
}

interface SyncDestinationRecord {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  packageType: string | null;
  finalPallets: number;
  pallets?: SyncPalletRecord[];
}

interface SyncContainerRecord {
  id: string;
  containerNo: string;
  status: string;
  destinations: SyncDestinationRecord[];
}

export interface ContainerPalletInventorySyncWarningDto {
  code: 'HISTORICAL_PALLETS_EXCLUDED';
  adjustedOutPallets: number;
  cancelledPallets: number;
}

export interface ContainerPalletInventoryDestinationSyncSummaryDto {
  containerDestinationId: string;
  destinationCode: string;
  expectedPallets: number;
  reusedPallets: number;
  createdPallets: number;
  cancelledPallets: number;
  activeTotalPallets: number;
  warnings: ContainerPalletInventorySyncWarningDto[];
}

export interface ContainerPalletInventorySyncSummaryDto {
  containerId: string;
  containerNo: string;
  destinations: ContainerPalletInventoryDestinationSyncSummaryDto[];
}

export interface SynchronizeContainerPalletInventoryInput {
  containerId: string;
  actorId: string | null;
}

@Injectable()
export class ContainerPalletInventorySyncService {
  async synchronizeForUnloading(
    tx: Prisma.TransactionClient,
    input: SynchronizeContainerPalletInventoryInput,
  ): Promise<ContainerPalletInventorySyncSummaryDto> {
    try {
      const container = await this.lockAndReadContainer(tx, input.containerId);
      this.assertContainerCanSynchronize(container);
      const labelDate = operationalLocalDate();

      const destinations: ContainerPalletInventoryDestinationSyncSummaryDto[] =
        [];
      for (const [
        destinationIndex,
        destination,
      ] of container.destinations.entries()) {
        destinations.push(
          await this.synchronizeDestination(tx, {
            actorId: input.actorId,
            container,
            destination,
            destinationIndex: destinationIndex + 1,
            labelDate,
          }),
        );
      }

      return {
        containerId: container.id,
        containerNo: container.containerNo,
        destinations,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const concurrentException = this.concurrentException(
        error,
        input.containerId,
      );
      if (concurrentException) {
        throw concurrentException;
      }
      throw new InternalServerErrorException({
        code: 'CONTAINER_INVENTORY_SYNC_FAILED',
        details: { containerId: input.containerId },
      });
    }
  }

  concurrentException(
    error: unknown,
    containerId: string | null,
  ): ConflictException | null {
    if (!this.isConcurrentPrismaError(error)) {
      return null;
    }
    return new ConflictException({
      code: 'CONTAINER_INVENTORY_SYNC_CONCURRENT',
      details: { containerId },
    });
  }

  private async lockAndReadContainer(
    tx: Prisma.TransactionClient,
    containerId: string,
  ): Promise<SyncContainerRecord> {
    await lockContainerRow(tx, containerId);
    const initial = await this.findContainerOrThrow(tx, containerId);
    await lockContainerDestinationRows(
      tx,
      initial.destinations.map((destination) => destination.id),
    );
    await lockPalletRows(
      tx,
      initial.destinations.flatMap((destination) =>
        (destination.pallets ?? []).map((pallet) => pallet.id),
      ),
    );
    return this.findContainerOrThrow(tx, containerId);
  }

  private async findContainerOrThrow(
    tx: Prisma.TransactionClient,
    containerId: string,
  ): Promise<SyncContainerRecord> {
    const container = (await tx.container.findUnique({
      where: { id: containerId },
      include: {
        destinations: {
          orderBy: [
            { destinationCode: 'asc' },
            { destinationType: 'asc' },
            { packageType: 'asc' },
          ],
          include: {
            pallets: {
              orderBy: [{ palletNo: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    })) as SyncContainerRecord | null;

    if (!container) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        details: { containerId },
      });
    }
    return container;
  }

  private assertContainerCanSynchronize(container: SyncContainerRecord): void {
    const effectiveStatus = effectiveContainerStatus(
      container.status,
      container.destinations,
    );
    if (
      effectiveStatus === ContainerStatus.LOADING_IN_PROGRESS ||
      effectiveStatus === ContainerStatus.LOADED
    ) {
      throw new ConflictException({
        code: 'CONTAINER_INVENTORY_SYNC_CONTAINER_LOCKED',
        details: {
          containerId: container.id,
          status: effectiveStatus,
        },
      });
    }
  }

  private async synchronizeDestination(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string | null;
      container: SyncContainerRecord;
      destination: SyncDestinationRecord;
      destinationIndex: number;
      labelDate: string;
    },
  ): Promise<ContainerPalletInventoryDestinationSyncSummaryDto> {
    const expectedPallets = this.expectedPallets(input.destination);
    const pallets = [...(input.destination.pallets ?? [])].sort(
      (left, right) =>
        left.palletNo - right.palletNo || left.id.localeCompare(right.id),
    );
    const activePallets = pallets.filter((pallet) =>
      this.isActivePallet(pallet),
    );
    const palletsToCancel = activePallets.slice(expectedPallets);
    const unsafePallets = palletsToCancel.filter(
      (pallet) => !this.isReusablePallet(pallet),
    );

    if (unsafePallets.length > 0) {
      throw new ConflictException({
        code: 'CONTAINER_INVENTORY_SYNC_UNSAFE_SURPLUS',
        details: {
          containerDestinationId: input.destination.id,
          expectedPallets,
          activePallets: activePallets.length,
          unsafePalletIds: unsafePallets.map((pallet) => pallet.id),
        },
      });
    }

    for (const pallet of palletsToCancel) {
      await tx.pallet.update({
        where: { id: pallet.id },
        data: { status: PalletStatus.CANCELLED },
      });
      await tx.palletEvent.create({
        data: {
          palletId: pallet.id,
          eventType: PalletEventType.CANCELLED,
          fromStatus: pallet.status as PalletStatus,
          toStatus: PalletStatus.CANCELLED,
          scanPayload: pallet.qrPayload,
          operatorId: input.actorId,
          metadata: this.eventMetadata(input, expectedPallets, {
            action: 'CANCEL_SAFE_SURPLUS_PALLET',
          }),
        },
      });
    }

    const shortage = Math.max(0, expectedPallets - activePallets.length);
    const createdPallets: SyncPalletRecord[] = [];
    const allocatedPalletNos = new Set(
      pallets.map((pallet) => pallet.palletNo),
    );
    for (const palletNo of this.nextPalletNos(
      allocatedPalletNos,
      expectedPallets,
      shortage,
    )) {
      const draft = buildPalletIdentityDraft({
        container: input.container,
        destination: input.destination,
        destinationIndex: input.destinationIndex,
        labelDate: input.labelDate,
        palletNo,
      });
      const created = (await tx.pallet.create({
        data: {
          containerDestinationId: input.destination.id,
          palletNo: draft.palletNo,
          palletId: draft.palletId,
          qrPayload: draft.qrPayload,
          status: PalletStatus.PLANNED,
          labelPrintedAt: null,
        },
      })) as SyncPalletRecord;
      createdPallets.push(created);
      await tx.palletEvent.create({
        data: {
          palletId: created.id,
          eventType: PalletEventType.CREATED,
          fromStatus: null,
          toStatus: PalletStatus.PLANNED,
          scanPayload: created.qrPayload,
          operatorId: input.actorId,
          metadata: this.eventMetadata(input, expectedPallets, {
            action: 'CREATE_MISSING_PALLET',
          }),
        },
      });
    }

    const historicalAdjustedOut = pallets.filter(
      (pallet) => pallet.status === PalletStatus.ADJUSTED_OUT,
    ).length;
    const historicalCancelled = pallets.filter(
      (pallet) => pallet.status === PalletStatus.CANCELLED,
    ).length;
    const warnings: ContainerPalletInventorySyncWarningDto[] =
      historicalAdjustedOut > 0 || historicalCancelled > 0
        ? [
            {
              code: 'HISTORICAL_PALLETS_EXCLUDED',
              adjustedOutPallets: historicalAdjustedOut,
              cancelledPallets: historicalCancelled,
            },
          ]
        : [];
    const cancelledPallets = palletsToCancel.length;
    const activeTotalPallets =
      activePallets.length - cancelledPallets + createdPallets.length;

    return {
      containerDestinationId: input.destination.id,
      destinationCode: input.destination.destinationCode,
      expectedPallets,
      reusedPallets: activePallets.length - cancelledPallets,
      createdPallets: createdPallets.length,
      cancelledPallets,
      activeTotalPallets,
      warnings,
    };
  }

  private expectedPallets(destination: SyncDestinationRecord): number {
    if (
      !Number.isFinite(destination.finalPallets) ||
      !Number.isSafeInteger(destination.finalPallets)
    ) {
      throw new BadRequestException({
        code: 'CONTAINER_INVENTORY_SYNC_INVALID_FINAL_COUNT',
        details: {
          containerDestinationId: destination.id,
          finalPallets: destination.finalPallets,
        },
      });
    }
    return Math.max(0, destination.finalPallets);
  }

  private isActivePallet(pallet: SyncPalletRecord): boolean {
    return (
      pallet.status !== PalletStatus.CANCELLED &&
      pallet.status !== PalletStatus.ADJUSTED_OUT
    );
  }

  private isReusablePallet(pallet: SyncPalletRecord): boolean {
    return (
      (pallet.status === PalletStatus.PLANNED ||
        pallet.status === PalletStatus.LABEL_PRINTED) &&
      !pallet.loadJobId &&
      !pallet.loadedAt
    );
  }

  private nextPalletNos(
    occupiedPalletNos: Set<number>,
    expectedPallets: number,
    count: number,
  ): number[] {
    const result: number[] = [];
    for (let palletNo = 1; palletNo <= expectedPallets; palletNo += 1) {
      if (!occupiedPalletNos.has(palletNo)) {
        occupiedPalletNos.add(palletNo);
        result.push(palletNo);
      }
      if (result.length === count) {
        return result;
      }
    }

    let palletNo = Math.max(0, ...occupiedPalletNos) + 1;
    while (result.length < count) {
      if (!occupiedPalletNos.has(palletNo)) {
        occupiedPalletNos.add(palletNo);
        result.push(palletNo);
      }
      palletNo += 1;
    }
    return result;
  }

  private eventMetadata(
    input: {
      actorId: string | null;
      container: SyncContainerRecord;
      destination: SyncDestinationRecord;
    },
    expectedPallets: number,
    additional: Record<string, string>,
  ): Prisma.InputJsonValue {
    return {
      source: INVENTORY_SYNC_SOURCE,
      actorId: input.actorId,
      containerId: input.container.id,
      containerNo: input.container.containerNo,
      containerDestinationId: input.destination.id,
      destinationCode: input.destination.destinationCode,
      expectedPallets,
      ...additional,
    };
  }

  private isConcurrentPrismaError(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      ['P2002', 'P2028', 'P2034'].includes(
        String((error as { code?: unknown }).code),
      )
    );
  }
}
