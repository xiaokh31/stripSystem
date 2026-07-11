import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ContainerDetailSummaryResponseDto,
  ContainerSummaryItemDto,
  ContainerSummaryListResponseDto,
  DestinationInventoryItemDto,
  DestinationSummaryItemDto,
  InventoryListResponseDto,
  PalletStatsDto,
} from './dto/inventory-response.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { effectiveContainerStatus } from '../common/container-lifecycle';
import { PalletStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface ContainerRecord {
  id: string;
  containerNo: string;
  status: string;
  payClassification?: string | null;
  payTrailerNumber?: string | null;
  destinations?: ContainerDestinationRecord[];
}

interface ContainerDestinationRecord {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  pallets?: PalletRecord[];
}

interface PalletRecord {
  id: string;
  loadJobId?: string | null;
  loadedAt?: Date | string | null;
  status: string;
}

@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async containerSummary(
    query: InventoryQueryDto,
  ): Promise<ContainerSummaryListResponseDto> {
    const containers = await this.findContainers();
    return {
      items: this.filteredContainers(containers, query).map((container) =>
        this.toContainerSummary(container, query),
      ),
    };
  }

  async inventory(query: InventoryQueryDto): Promise<InventoryListResponseDto> {
    const containers = this.filteredContainers(
      await this.findContainers(),
      query,
    );
    const byDestination = new Map<string, DestinationInventoryItemDto>();

    containers.forEach((container) => {
      this.filteredDestinations(container, query).forEach((destination) => {
        const stats = this.stats(destination.pallets ?? [], query.status);
        const existing = byDestination.get(destination.destinationCode);
        if (existing) {
          existing.totalPallets += stats.totalPallets;
          existing.loadedPallets += stats.loadedPallets;
          existing.adjustedOutPallets += stats.adjustedOutPallets;
          existing.cancelledPallets += stats.cancelledPallets;
          existing.remainingPallets += stats.remainingPallets;
          return;
        }

        byDestination.set(destination.destinationCode, {
          destinationCode: destination.destinationCode,
          ...stats,
        });
      });
    });

    return {
      items: [...byDestination.values()].sort((left, right) =>
        left.destinationCode.localeCompare(right.destinationCode),
      ),
    };
  }

  async containerDetailSummary(
    id: string,
    query: InventoryQueryDto,
  ): Promise<ContainerDetailSummaryResponseDto> {
    const container = await this.findContainerOrThrow(id);
    return {
      ...this.toContainerSummary(container, query),
      destinations: this.filteredDestinations(container, query).map(
        (destination) => this.toDestinationSummary(destination, query),
      ),
    };
  }

  private async findContainers(): Promise<ContainerRecord[]> {
    return await this.prisma.container.findMany({
      include: {
        destinations: {
          include: {
            pallets: true,
          },
          orderBy: [{ destinationCode: 'asc' }, { destinationType: 'asc' }],
        },
      },
      orderBy: { containerNo: 'asc' },
    });
  }

  private async findContainerOrThrow(id: string): Promise<ContainerRecord> {
    const container = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          include: {
            pallets: true,
          },
          orderBy: [{ destinationCode: 'asc' }, { destinationType: 'asc' }],
        },
      },
    })) as ContainerRecord | null;

    if (!container) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${id} was not found.`,
        details: { id },
      });
    }

    return container;
  }

  private filteredContainers(
    containers: ContainerRecord[],
    query: InventoryQueryDto,
  ): ContainerRecord[] {
    return containers
      .filter((container) => this.matchesContainerNo(container, query))
      .filter(
        (container) => this.filteredDestinations(container, query).length > 0,
      );
  }

  private filteredDestinations(
    container: ContainerRecord,
    query: InventoryQueryDto,
  ): ContainerDestinationRecord[] {
    return (container.destinations ?? [])
      .filter((destination) => this.matchesDestination(destination, query))
      .filter(
        (destination) =>
          this.stats(destination.pallets ?? [], query.status).totalPallets > 0,
      );
  }

  private toContainerSummary(
    container: ContainerRecord,
    query: InventoryQueryDto,
  ): ContainerSummaryItemDto {
    const stats = this.filteredDestinations(container, query).reduce(
      (total, destination) =>
        this.addStats(
          total,
          this.stats(destination.pallets ?? [], query.status),
        ),
      this.emptyStats(),
    );

    return {
      containerId: container.id,
      containerNo: container.containerNo,
      status: effectiveContainerStatus(
        container.status,
        container.destinations ?? [],
      ),
      payClassification: container.payClassification ?? null,
      payTrailerNumber: container.payTrailerNumber ?? null,
      ...stats,
    };
  }

  private toDestinationSummary(
    destination: ContainerDestinationRecord,
    query: InventoryQueryDto,
  ): DestinationSummaryItemDto {
    return {
      containerDestinationId: destination.id,
      destinationCode: destination.destinationCode,
      destinationType: destination.destinationType,
      ...this.stats(destination.pallets ?? [], query.status),
    };
  }

  private stats(
    pallets: PalletRecord[],
    statusFilter?: string,
  ): PalletStatsDto {
    const filtered = statusFilter
      ? pallets.filter((pallet) => pallet.status === statusFilter)
      : pallets;
    const loadedPallets = filtered.filter(
      (pallet) => pallet.status === PalletStatus.LOADED,
    ).length;
    const adjustedOutPallets = filtered.filter(
      (pallet) => pallet.status === PalletStatus.ADJUSTED_OUT,
    ).length;
    const cancelledPallets = filtered.filter(
      (pallet) => pallet.status === PalletStatus.CANCELLED,
    ).length;
    const remainingPallets = filtered.filter(
      (pallet) =>
        pallet.status !== PalletStatus.LOADED &&
        pallet.status !== PalletStatus.CANCELLED &&
        pallet.status !== PalletStatus.ADJUSTED_OUT,
    ).length;
    const totalPallets = filtered.length;

    return {
      totalPallets,
      loadedPallets,
      adjustedOutPallets,
      cancelledPallets,
      remainingPallets,
    };
  }

  private addStats(
    left: PalletStatsDto,
    right: PalletStatsDto,
  ): PalletStatsDto {
    return {
      totalPallets: left.totalPallets + right.totalPallets,
      loadedPallets: left.loadedPallets + right.loadedPallets,
      adjustedOutPallets: left.adjustedOutPallets + right.adjustedOutPallets,
      cancelledPallets: left.cancelledPallets + right.cancelledPallets,
      remainingPallets: left.remainingPallets + right.remainingPallets,
    };
  }

  private emptyStats(): PalletStatsDto {
    return {
      totalPallets: 0,
      loadedPallets: 0,
      adjustedOutPallets: 0,
      cancelledPallets: 0,
      remainingPallets: 0,
    };
  }

  private matchesContainerNo(
    container: ContainerRecord,
    query: InventoryQueryDto,
  ): boolean {
    if (!query.containerNo) {
      return true;
    }
    return container.containerNo
      .toLowerCase()
      .includes(query.containerNo.toLowerCase());
  }

  private matchesDestination(
    destination: ContainerDestinationRecord,
    query: InventoryQueryDto,
  ): boolean {
    if (!query.destinationCode) {
      return true;
    }
    return destination.destinationCode
      .toLowerCase()
      .includes(query.destinationCode.toLowerCase());
  }
}
