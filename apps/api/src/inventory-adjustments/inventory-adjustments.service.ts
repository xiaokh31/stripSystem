import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { auditUserId } from '../auth/audit-user';
import type { AuthenticatedUser } from '../auth/auth-user';
import {
  InventoryAdjustmentReasonCode,
  InventoryAdjustmentType,
  PalletEventType,
  PalletStatus,
} from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import {
  InventoryAdjustmentListResponseDto,
  InventoryAdjustmentPalletDto,
  InventoryAdjustmentResponseDto,
} from './dto/inventory-adjustment-response.dto';

type PalletStatusValue = (typeof PalletStatus)[keyof typeof PalletStatus];

interface ContainerDestinationRecord {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  container: {
    id: string;
    containerNo: string;
  };
}

interface PalletRecord {
  id: string;
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: PalletStatusValue;
  loadedAt: Date | string | null;
  loadJobId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PalletEventRecord {
  id: string;
  palletId: string | null;
  fromStatus: PalletStatusValue | null;
  toStatus: PalletStatusValue | null;
  pallet?: {
    id: string;
    palletId: string;
    palletNo: number;
  } | null;
}

interface InventoryAdjustmentRecord {
  id: string;
  containerId: string;
  containerDestinationId: string;
  adjustmentType: string;
  palletCount: number;
  reasonCode: string;
  note: string | null;
  metadata: unknown;
  createdById: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  events?: PalletEventRecord[];
}

interface InventoryAdjustmentTransactionClient {
  $queryRaw(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
  containerDestination: {
    findUnique(args: unknown): Promise<unknown>;
  };
  inventoryAdjustment: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
  };
  pallet: {
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  palletEvent: {
    create(args: unknown): Promise<unknown>;
  };
}

const ELIGIBLE_DEPLETION_STATUSES: PalletStatusValue[] = [
  PalletStatus.PLANNED,
  PalletStatus.LABEL_PRINTED,
  PalletStatus.EXCEPTION,
];

const PALLET_ORDER = [{ palletNo: 'asc' }, { id: 'asc' }] as const;

const PALLET_SELECT = {
  id: true,
  containerDestinationId: true,
  palletNo: true,
  palletId: true,
  qrPayload: true,
  status: true,
  loadedAt: true,
  loadJobId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PalletSelect;

const DESTINATION_SELECT = {
  id: true,
  containerId: true,
  destinationCode: true,
  destinationType: true,
  container: {
    select: {
      id: true,
      containerNo: true,
    },
  },
} satisfies Prisma.ContainerDestinationSelect;

@Injectable()
export class InventoryAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    containerDestinationId: string,
    dto: CreateInventoryAdjustmentDto,
    actor: AuthenticatedUser,
  ): Promise<InventoryAdjustmentResponseDto> {
    const note = this.stringOrNull(dto.note);
    const requestedPalletTokens = this.normalizedPalletTokens(dto.palletIds);
    const requestedCount =
      requestedPalletTokens.length > 0
        ? requestedPalletTokens.length
        : dto.count;

    this.assertCreateRequest(dto.reasonCode, note, requestedCount);

    const result = await this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as InventoryAdjustmentTransactionClient;
      const destination = await this.findDestinationOrThrow(
        client,
        containerDestinationId,
      );
      const selectedPallets =
        requestedPalletTokens.length > 0
          ? await this.selectRequestedPallets(
              client,
              containerDestinationId,
              requestedPalletTokens,
            )
          : await this.selectPalletsByCount(
              client,
              containerDestinationId,
              requestedCount ?? 0,
            );

      for (const pallet of selectedPallets) {
        await this.lockPalletRow(client, pallet.id);
      }

      const lockedPallets = this.orderPalletsBySelectedIds(
        await this.findPalletsByIds(
          client,
          selectedPallets.map((pallet) => pallet.id),
        ),
        selectedPallets.map((pallet) => pallet.id),
      );
      this.assertSelectedPalletsStillEligible(
        lockedPallets,
        selectedPallets.length,
      );

      const adjustment = (await client.inventoryAdjustment.create({
        data: {
          containerId: destination.containerId,
          containerDestinationId: destination.id,
          adjustmentType: InventoryAdjustmentType.MANUAL_DEPLETION,
          palletCount: lockedPallets.length,
          reasonCode: dto.reasonCode,
          note,
          metadata: this.adjustmentMetadata({
            destination,
            note,
            requestedCount: requestedCount ?? lockedPallets.length,
            requestedPalletTokens,
            selectedPallets: lockedPallets,
          }),
          createdById: auditUserId(actor),
        },
      })) as InventoryAdjustmentRecord;

      const adjustedPallets: InventoryAdjustmentPalletDto[] = [];
      for (const pallet of lockedPallets) {
        const fromStatus = pallet.status;
        const event = (await client.palletEvent.create({
          data: {
            palletId: pallet.id,
            inventoryAdjustmentId: adjustment.id,
            eventType: PalletEventType.MANUAL_INVENTORY_DEPLETION,
            fromStatus,
            toStatus: PalletStatus.ADJUSTED_OUT,
            scanPayload: pallet.qrPayload,
            operatorId: auditUserId(actor),
            exceptionReason: dto.reasonCode,
            metadata: this.palletEventMetadata({
              adjustmentId: adjustment.id,
              destination,
              note,
              pallet,
              reasonCode: dto.reasonCode,
            }),
          },
        })) as PalletEventRecord;

        await client.pallet.update({
          where: { id: pallet.id },
          data: {
            status: PalletStatus.ADJUSTED_OUT,
            loadedAt: null,
            loadJobId: null,
          },
        });

        adjustedPallets.push({
          id: pallet.id,
          palletId: pallet.palletId,
          palletNo: pallet.palletNo,
          fromStatus,
          toStatus: PalletStatus.ADJUSTED_OUT,
          eventId: event.id,
        });
      }

      return { adjustment, adjustedPallets };
    });

    return this.toResponse(result.adjustment, result.adjustedPallets);
  }

  async list(
    containerDestinationId: string,
  ): Promise<InventoryAdjustmentListResponseDto> {
    const destination = await this.prisma.containerDestination.findUnique({
      where: { id: containerDestinationId },
      select: { id: true },
    });
    if (!destination) {
      throw new NotFoundException({
        code: 'CONTAINER_DESTINATION_NOT_FOUND',
        message: `Container destination ${containerDestinationId} was not found.`,
        details: { containerDestinationId },
      });
    }

    const records = (await this.prisma.inventoryAdjustment.findMany({
      where: { containerDestinationId },
      include: {
        events: {
          where: {
            eventType: PalletEventType.MANUAL_INVENTORY_DEPLETION,
          },
          include: {
            pallet: {
              select: {
                id: true,
                palletId: true,
                palletNo: true,
              },
            },
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as InventoryAdjustmentRecord[];

    return {
      items: records.map((record) => this.toResponse(record)),
    };
  }

  private assertCreateRequest(
    reasonCode: InventoryAdjustmentReasonCode,
    note: string | null,
    requestedCount?: number,
  ): void {
    if (!requestedCount || requestedCount <= 0) {
      throw new BadRequestException({
        code: 'INVENTORY_ADJUSTMENT_TARGET_REQUIRED',
        message: 'Manual inventory depletion requires count or palletIds.',
        details: {},
      });
    }

    if (reasonCode === InventoryAdjustmentReasonCode.OTHER && !note) {
      throw new BadRequestException({
        code: 'INVENTORY_ADJUSTMENT_REASON_REQUIRED',
        message: 'Reason note is required when reasonCode is OTHER.',
        details: { reasonCode },
      });
    }
  }

  private async findDestinationOrThrow(
    client: Pick<InventoryAdjustmentTransactionClient, 'containerDestination'>,
    containerDestinationId: string,
  ): Promise<ContainerDestinationRecord> {
    const destination = (await client.containerDestination.findUnique({
      where: { id: containerDestinationId },
      select: DESTINATION_SELECT,
    })) as ContainerDestinationRecord | null;

    if (!destination) {
      throw new NotFoundException({
        code: 'CONTAINER_DESTINATION_NOT_FOUND',
        message: `Container destination ${containerDestinationId} was not found.`,
        details: { containerDestinationId },
      });
    }

    return destination;
  }

  private async selectRequestedPallets(
    client: Pick<InventoryAdjustmentTransactionClient, 'pallet'>,
    containerDestinationId: string,
    tokens: string[],
  ): Promise<PalletRecord[]> {
    const records = (await client.pallet.findMany({
      where: {
        containerDestinationId,
        OR: [{ id: { in: tokens } }, { palletId: { in: tokens } }],
      },
      select: PALLET_SELECT,
      orderBy: PALLET_ORDER,
    })) as PalletRecord[];

    const selected = new Map<string, PalletRecord>();
    for (const token of tokens) {
      const match = records.find(
        (record) => record.id === token || record.palletId === token,
      );
      if (!match) {
        throw new ConflictException({
          code: 'INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE',
          message:
            'Requested pallet is not eligible for manual inventory depletion.',
          details: { containerDestinationId, palletId: token },
        });
      }
      selected.set(match.id, match);
    }

    const pallets = [...selected.values()];
    this.assertPalletsEligible(pallets);
    return pallets;
  }

  private async selectPalletsByCount(
    client: Pick<InventoryAdjustmentTransactionClient, 'pallet'>,
    containerDestinationId: string,
    count: number,
  ): Promise<PalletRecord[]> {
    const where = {
      containerDestinationId,
      status: { in: ELIGIBLE_DEPLETION_STATUSES },
      loadJobId: null,
    } satisfies Prisma.PalletWhereInput;
    const eligibleCount = await client.pallet.count({ where });

    if (eligibleCount === 0) {
      throw new ConflictException({
        code: 'INVENTORY_ADJUSTMENT_NO_ELIGIBLE_PALLETS',
        message: 'No eligible pallets remain for manual inventory depletion.',
        details: { containerDestinationId },
      });
    }

    if (count > eligibleCount) {
      throw new ConflictException({
        code: 'INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING',
        message:
          'Requested depletion count exceeds eligible remaining pallets.',
        details: {
          containerDestinationId,
          requestedCount: count,
          eligibleCount,
        },
      });
    }

    return (await client.pallet.findMany({
      where,
      select: PALLET_SELECT,
      orderBy: PALLET_ORDER,
      take: count,
    })) as PalletRecord[];
  }

  private assertSelectedPalletsStillEligible(
    pallets: PalletRecord[],
    expectedCount: number,
  ): void {
    if (pallets.length !== expectedCount) {
      throw new ConflictException({
        code: 'INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE',
        message:
          'A selected pallet could not be re-read for manual inventory depletion.',
        details: { expectedCount, actualCount: pallets.length },
      });
    }

    this.assertPalletsEligible(pallets);
  }

  private assertPalletsEligible(pallets: PalletRecord[]): void {
    for (const pallet of pallets) {
      if (
        !ELIGIBLE_DEPLETION_STATUSES.includes(pallet.status) ||
        pallet.loadJobId ||
        pallet.loadedAt
      ) {
        throw new ConflictException({
          code: 'INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE',
          message:
            'Requested pallet is not eligible for manual inventory depletion.',
          details: {
            palletRecordId: pallet.id,
            palletId: pallet.palletId,
            status: pallet.status,
            loadJobId: pallet.loadJobId,
            loadedAt: pallet.loadedAt,
          },
        });
      }
    }
  }

  private async findPalletsByIds(
    client: Pick<InventoryAdjustmentTransactionClient, 'pallet'>,
    palletIds: string[],
  ): Promise<PalletRecord[]> {
    return (await client.pallet.findMany({
      where: { id: { in: palletIds } },
      select: PALLET_SELECT,
      orderBy: PALLET_ORDER,
    })) as PalletRecord[];
  }

  private orderPalletsBySelectedIds(
    pallets: PalletRecord[],
    selectedIds: string[],
  ): PalletRecord[] {
    const byId = new Map(pallets.map((pallet) => [pallet.id, pallet]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((pallet): pallet is PalletRecord => Boolean(pallet));
  }

  private async lockPalletRow(
    client: Pick<InventoryAdjustmentTransactionClient, '$queryRaw'>,
    palletId: string,
  ): Promise<void> {
    await client.$queryRaw`SELECT "id" FROM "pallets" WHERE "id" = ${palletId} FOR UPDATE`;
  }

  private adjustmentMetadata(input: {
    destination: ContainerDestinationRecord;
    note: string | null;
    requestedCount: number;
    requestedPalletTokens: string[];
    selectedPallets: PalletRecord[];
  }): Prisma.InputJsonValue {
    return {
      action: 'MANUAL_INVENTORY_DEPLETION',
      containerId: input.destination.containerId,
      containerNo: input.destination.container.containerNo,
      containerDestinationId: input.destination.id,
      destinationCode: input.destination.destinationCode,
      destinationType: input.destination.destinationType,
      requestedCount: input.requestedCount,
      requestedPalletIds: input.requestedPalletTokens,
      selectedPallets: input.selectedPallets.map((pallet) => ({
        id: pallet.id,
        palletId: pallet.palletId,
        palletNo: pallet.palletNo,
        fromStatus: pallet.status,
      })),
      note: input.note,
    };
  }

  private palletEventMetadata(input: {
    adjustmentId: string;
    destination: ContainerDestinationRecord;
    note: string | null;
    pallet: PalletRecord;
    reasonCode: InventoryAdjustmentReasonCode;
  }): Prisma.InputJsonValue {
    return {
      action: 'MANUAL_INVENTORY_DEPLETION',
      adjustmentId: input.adjustmentId,
      reasonCode: input.reasonCode,
      note: input.note,
      containerId: input.destination.containerId,
      containerNo: input.destination.container.containerNo,
      containerDestinationId: input.destination.id,
      destinationCode: input.destination.destinationCode,
      destinationType: input.destination.destinationType,
      palletRecordId: input.pallet.id,
      businessPalletId: input.pallet.palletId,
      palletNo: input.pallet.palletNo,
      fromStatus: input.pallet.status,
      toStatus: PalletStatus.ADJUSTED_OUT,
    };
  }

  private toResponse(
    record: InventoryAdjustmentRecord,
    adjustedPallets?: InventoryAdjustmentPalletDto[],
  ): InventoryAdjustmentResponseDto {
    const pallets =
      adjustedPallets ??
      (record.events ?? []).map((event) => ({
        id: event.pallet?.id ?? event.palletId ?? '',
        palletId: event.pallet?.palletId ?? '',
        palletNo: event.pallet?.palletNo ?? 0,
        fromStatus: event.fromStatus ?? '',
        toStatus: event.toStatus ?? '',
        eventId: event.id,
      }));

    return {
      id: record.id,
      containerId: record.containerId,
      containerDestinationId: record.containerDestinationId,
      adjustmentType: record.adjustmentType,
      palletCount: record.palletCount,
      reasonCode: record.reasonCode,
      note: record.note,
      metadata: record.metadata,
      createdById: record.createdById,
      createdAt: this.isoDate(record.createdAt),
      updatedAt: this.isoDate(record.updatedAt),
      pallets,
    };
  }

  private normalizedPalletTokens(value?: string[]): string[] {
    return [
      ...new Set(
        (value ?? [])
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    ];
  }

  private stringOrNull(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isoDate(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}
