import { Injectable, NotFoundException } from '@nestjs/common';
import {
  compareContainerOrder,
  type ContainerSortDirection,
  type ContainerSortField,
} from '../common/container-ordering';
import {
  escapeSqlLikePattern,
  normalizeContainerSearchValue,
} from '../common/container-search';
import {
  effectiveContainerStatus,
  effectiveContainerStatusFromAggregate,
} from '../common/container-lifecycle';
import { PalletStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import {
  ContainerDetailSummaryResponseDto,
  ContainerSummaryItemDto,
  ContainerSummaryListResponseDto,
  DestinationSummaryItemDto,
  InventoryListResponseDto,
  PalletStatsDto,
} from './dto/inventory-response.dto';

interface ContainerAggregateRow {
  containerId: string;
  containerNo: string;
  storedStatus: string;
  createdAt: Date | string;
  payClassification: string | null;
  payTrailerNumber: string | null;
  totalPallets: number;
  activeTotalPallets: number;
  effectiveLoadedPallets: number;
  loadedPallets: number;
  adjustedOutPallets: number;
  cancelledPallets: number;
  remainingPallets: number;
  lifecycleActivePallets: number;
  hasLoadingSignal: boolean;
}

interface DestinationAggregateRow {
  destinationCode: string;
  totalPallets: number;
  activeTotalPallets: number;
  loadedPallets: number;
  adjustedOutPallets: number;
  cancelledPallets: number;
  remainingPallets: number;
}

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

interface NormalizedInventoryQuery {
  containerNo: string;
  destinationCode: string;
  status: string;
  page: number;
  pageSize: number;
  sortBy: ContainerSortField;
  sortDirection: ContainerSortDirection;
}

@Injectable()
export class InventoryReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async containerSummary(
    query: InventoryQueryDto,
  ): Promise<ContainerSummaryListResponseDto> {
    const normalized = this.normalizeQuery(query);
    const rows = await this.findContainerAggregates(normalized);
    const ordered = rows
      .map((row) => this.toAggregateItem(row))
      .sort((left, right) =>
        compareContainerOrder(
          left,
          right,
          normalized.sortBy,
          normalized.sortDirection,
        ),
      );
    const totalItems = ordered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / normalized.pageSize));
    const page = Math.min(normalized.page, totalPages);
    const pageOffset = (page - 1) * normalized.pageSize;

    return {
      items: ordered
        .slice(pageOffset, pageOffset + normalized.pageSize)
        .map(({ createdAt, ...item }) => {
          void createdAt;
          return item;
        }),
      page,
      pageSize: normalized.pageSize,
      totalItems,
      totalPages,
      totals: ordered.reduce(
        (total, item) => this.addStats(total, item),
        this.emptyStats(),
      ),
    };
  }

  async inventory(query: InventoryQueryDto): Promise<InventoryListResponseDto> {
    const normalized = this.normalizeQuery(query);
    const rows = await this.findDestinationAggregates(normalized);
    return {
      items: rows.map((row) => ({
        destinationCode: row.destinationCode,
        ...this.statsFromAggregate(row),
      })),
    };
  }

  async containerDetailSummary(
    id: string,
    query: InventoryQueryDto,
  ): Promise<ContainerDetailSummaryResponseDto> {
    const container = await this.findContainerOrThrow(id);
    const destinations = this.filteredDestinations(container, query, true);
    return {
      ...this.toContainerSummary(container, query, destinations),
      destinations: destinations.map((destination) =>
        this.toDestinationSummary(destination, query),
      ),
    };
  }

  private async findContainerAggregates(
    query: NormalizedInventoryQuery,
  ): Promise<ContainerAggregateRow[]> {
    const containerPattern = `%${escapeSqlLikePattern(query.containerNo)}%`;
    const destinationPattern = `%${escapeSqlLikePattern(query.destinationCode)}%`;
    const hasContainerFilter = query.containerNo.length > 0;
    const hasDestinationFilter = query.destinationCode.length > 0;
    const hasStatusFilter = query.status.length > 0;

    return await this.prisma.$queryRaw<ContainerAggregateRow[]>`
      SELECT
        c."id" AS "containerId",
        c."container_no" AS "containerNo",
        c."status"::text AS "storedStatus",
        c."created_at" AS "createdAt",
        c."pay_classification"::text AS "payClassification",
        c."pay_trailer_number" AS "payTrailerNumber",
        COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND (${!hasStatusFilter} OR p."status"::text = ${query.status})
        )::int AS "totalPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
        )::int AS "activeTotalPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" = 'LOADED'
        )::int AS "loadedPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" = 'ADJUSTED_OUT'
        )::int AS "adjustedOutPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" = 'CANCELLED'
        )::int AS "cancelledPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" NOT IN ('LOADED', 'ADJUSTED_OUT', 'CANCELLED')
        )::int AS "remainingPallets",
        COUNT(p."id") FILTER (
          WHERE p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
        )::int AS "lifecycleActivePallets",
        COUNT(p."id") FILTER (
          WHERE p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
            AND (p."status" = 'LOADED' OR p."loaded_at" IS NOT NULL)
        )::int AS "effectiveLoadedPallets",
        COALESCE(
          BOOL_OR(
            p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
            AND (p."status" = 'LOADING' OR p."load_job_id" IS NOT NULL)
          ),
          false
        ) AS "hasLoadingSignal"
      FROM "containers" AS c
      LEFT JOIN "container_destinations" AS d ON d."container_id" = c."id"
      LEFT JOIN "pallets" AS p ON p."container_destination_id" = d."id"
      WHERE (${!hasContainerFilter} OR LOWER(c."container_no") LIKE ${containerPattern} ESCAPE '\\')
      GROUP BY c."id", c."container_no", c."status", c."created_at",
        c."pay_classification", c."pay_trailer_number"
      HAVING (
        (${hasStatusFilter} AND COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND p."status"::text = ${query.status}
        ) > 0)
        OR
        (${!hasStatusFilter} AND COUNT(p."id") FILTER (
          WHERE (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
            AND p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
        ) > 0)
      )
    `;
  }

  private async findDestinationAggregates(
    query: NormalizedInventoryQuery,
  ): Promise<DestinationAggregateRow[]> {
    const containerPattern = `%${escapeSqlLikePattern(query.containerNo)}%`;
    const destinationPattern = `%${escapeSqlLikePattern(query.destinationCode)}%`;
    const hasContainerFilter = query.containerNo.length > 0;
    const hasDestinationFilter = query.destinationCode.length > 0;
    const hasStatusFilter = query.status.length > 0;

    return await this.prisma.$queryRaw<DestinationAggregateRow[]>`
      SELECT
        d."destination_code" AS "destinationCode",
        COUNT(p."id") FILTER (
          WHERE (${!hasStatusFilter} OR p."status"::text = ${query.status})
        )::int AS "totalPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
        )::int AS "activeTotalPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" = 'LOADED'
        )::int AS "loadedPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" = 'ADJUSTED_OUT'
        )::int AS "adjustedOutPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" = 'CANCELLED'
        )::int AS "cancelledPallets",
        COUNT(p."id") FILTER (
          WHERE (${!hasStatusFilter} OR p."status"::text = ${query.status})
            AND p."status" NOT IN ('LOADED', 'ADJUSTED_OUT', 'CANCELLED')
        )::int AS "remainingPallets"
      FROM "containers" AS c
      JOIN "container_destinations" AS d ON d."container_id" = c."id"
      JOIN "pallets" AS p ON p."container_destination_id" = d."id"
      WHERE (${!hasContainerFilter} OR LOWER(c."container_no") LIKE ${containerPattern} ESCAPE '\\')
        AND (${!hasDestinationFilter} OR LOWER(d."destination_code") LIKE ${destinationPattern} ESCAPE '\\')
      GROUP BY d."destination_code"
      HAVING (
        (${hasStatusFilter} AND COUNT(p."id") FILTER (
          WHERE p."status"::text = ${query.status}
        ) > 0)
        OR
        (${!hasStatusFilter} AND COUNT(p."id") FILTER (
          WHERE p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
        ) > 0)
      )
      ORDER BY d."destination_code" ASC
    `;
  }

  private toAggregateItem(row: ContainerAggregateRow): ContainerSummaryItemDto & {
    createdAt: string;
  } {
    const lifecycleActivePallets = Number(row.lifecycleActivePallets);
    return {
      containerId: row.containerId,
      containerNo: row.containerNo,
      createdAt: new Date(row.createdAt).toISOString(),
      payClassification: row.payClassification ?? null,
      payTrailerNumber: row.payTrailerNumber ?? null,
      status: effectiveContainerStatusFromAggregate(row.storedStatus, {
        activePalletCount: lifecycleActivePallets,
        hasLoadingSignal: row.hasLoadingSignal,
        loadedPalletCount: Number(row.effectiveLoadedPallets),
      }),
      ...this.statsFromAggregate(row),
    };
  }

  private statsFromAggregate(
    row: Omit<DestinationAggregateRow, 'destinationCode'>,
  ): PalletStatsDto {
    return {
      totalPallets: Number(row.totalPallets),
      activeTotalPallets: Number(row.activeTotalPallets),
      loadedPallets: Number(row.loadedPallets),
      adjustedOutPallets: Number(row.adjustedOutPallets),
      cancelledPallets: Number(row.cancelledPallets),
      remainingPallets: Number(row.remainingPallets),
    };
  }

  private normalizeQuery(query: InventoryQueryDto): NormalizedInventoryQuery {
    return {
      containerNo: normalizeContainerSearchValue(query.containerNo ?? ''),
      destinationCode: normalizeContainerSearchValue(
        query.destinationCode ?? '',
      ),
      status: query.status ?? '',
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
      sortBy: query.sortBy ?? 'createdAt',
      sortDirection: query.sortDirection ?? 'desc',
    };
  }

  private async findContainerOrThrow(id: string): Promise<ContainerRecord> {
    const container = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          include: { pallets: true },
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

  private filteredDestinations(
    container: ContainerRecord,
    query: InventoryQueryDto,
    includeHistorical = false,
  ): ContainerDestinationRecord[] {
    return (container.destinations ?? [])
      .filter((destination) => this.matchesDestination(destination, query))
      .filter((destination) => {
        const stats = this.stats(destination.pallets ?? [], query.status);
        return query.status
          ? stats.totalPallets > 0
          : includeHistorical
            ? stats.totalPallets > 0
            : stats.activeTotalPallets > 0;
      });
  }

  private toContainerSummary(
    container: ContainerRecord,
    query: InventoryQueryDto,
    destinations = this.filteredDestinations(container, query),
  ): ContainerSummaryItemDto {
    const stats = destinations.reduce(
      (total, destination) =>
        this.addStats(total, this.stats(destination.pallets ?? [], query.status)),
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

  private stats(pallets: PalletRecord[], statusFilter?: string): PalletStatsDto {
    const filtered = statusFilter
      ? pallets.filter((pallet) => pallet.status === statusFilter)
      : pallets;
    return {
      totalPallets: filtered.length,
      activeTotalPallets: filtered.filter(
        (pallet) =>
          pallet.status !== PalletStatus.CANCELLED &&
          pallet.status !== PalletStatus.ADJUSTED_OUT,
      ).length,
      loadedPallets: filtered.filter(
        (pallet) => pallet.status === PalletStatus.LOADED,
      ).length,
      adjustedOutPallets: filtered.filter(
        (pallet) => pallet.status === PalletStatus.ADJUSTED_OUT,
      ).length,
      cancelledPallets: filtered.filter(
        (pallet) => pallet.status === PalletStatus.CANCELLED,
      ).length,
      remainingPallets: filtered.filter(
        (pallet) =>
          pallet.status !== PalletStatus.LOADED &&
          pallet.status !== PalletStatus.CANCELLED &&
          pallet.status !== PalletStatus.ADJUSTED_OUT,
      ).length,
    };
  }

  private addStats(left: PalletStatsDto, right: PalletStatsDto): PalletStatsDto {
    return {
      totalPallets: left.totalPallets + right.totalPallets,
      activeTotalPallets: left.activeTotalPallets + right.activeTotalPallets,
      loadedPallets: left.loadedPallets + right.loadedPallets,
      adjustedOutPallets:
        left.adjustedOutPallets + right.adjustedOutPallets,
      cancelledPallets: left.cancelledPallets + right.cancelledPallets,
      remainingPallets: left.remainingPallets + right.remainingPallets,
    };
  }

  private emptyStats(): PalletStatsDto {
    return {
      totalPallets: 0,
      activeTotalPallets: 0,
      loadedPallets: 0,
      adjustedOutPallets: 0,
      cancelledPallets: 0,
      remainingPallets: 0,
    };
  }

  private matchesDestination(
    destination: ContainerDestinationRecord,
    query: InventoryQueryDto,
  ): boolean {
    if (!query.destinationCode) return true;
    return destination.destinationCode
      .toLowerCase()
      .includes(query.destinationCode.toLowerCase());
  }
}
