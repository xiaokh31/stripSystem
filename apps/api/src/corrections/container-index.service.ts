import { Injectable } from '@nestjs/common';
import {
  ContainerIndexItemDto,
  ContainerIndexListResponseDto,
  ContainerIndexQueryDto,
} from './dto/container-index.dto';
import {
  compareContainerNumbers,
  escapeSqlLikePattern,
  normalizeContainerSearchValue,
} from '../common/container-search';
import { effectiveContainerStatusFromAggregate } from '../common/container-lifecycle';
import { ContainerStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface ContainerIndexRow {
  containerId: string;
  containerNo: string;
  storedStatus: string;
  createdAt: Date | string;
  totalPallets: number;
  activeTotalPallets: number;
  effectiveLoadedPallets: number;
  loadedPallets: number;
  adjustedOutPallets: number;
  cancelledPallets: number;
  remainingPallets: number;
  hasLoadingSignal: boolean;
}

const CONTAINER_STATUS_RANK = new Map<string, number>(
  [
    ContainerStatus.IMPORTED,
    ContainerStatus.PARSED,
    ContainerStatus.CORRECTED,
    ContainerStatus.REPORT_GENERATED,
    ContainerStatus.LABELS_GENERATED,
    ContainerStatus.UNLOADED,
    ContainerStatus.LOADING_IN_PROGRESS,
    ContainerStatus.LOADED,
    ContainerStatus.ERROR,
  ].map((status, index) => [status, index]),
);

@Injectable()
export class ContainerIndexService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ContainerIndexQueryDto,
  ): Promise<ContainerIndexListResponseDto> {
    const normalizedSearch = normalizeContainerSearchValue(
      query.containerNo ?? '',
    );
    const searchPattern = normalizedSearch
      ? `%${escapeSqlLikePattern(normalizedSearch)}%`
      : '';
    const rows = await this.prisma.$queryRaw<ContainerIndexRow[]>`
      SELECT
        c."id" AS "containerId",
        c."container_no" AS "containerNo",
        c."status"::text AS "storedStatus",
        c."created_at" AS "createdAt",
        COUNT(p."id")::int AS "totalPallets",
        COUNT(p."id") FILTER (
          WHERE p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
        )::int AS "activeTotalPallets",
        COUNT(p."id") FILTER (WHERE p."status" = 'LOADED')::int AS "loadedPallets",
        COUNT(p."id") FILTER (
          WHERE p."status" NOT IN ('ADJUSTED_OUT', 'CANCELLED')
            AND (p."status" = 'LOADED' OR p."loaded_at" IS NOT NULL)
        )::int AS "effectiveLoadedPallets",
        COUNT(p."id") FILTER (WHERE p."status" = 'ADJUSTED_OUT')::int AS "adjustedOutPallets",
        COUNT(p."id") FILTER (WHERE p."status" = 'CANCELLED')::int AS "cancelledPallets",
        COUNT(p."id") FILTER (
          WHERE p."status" NOT IN ('LOADED', 'ADJUSTED_OUT', 'CANCELLED')
        )::int AS "remainingPallets",
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
      WHERE (${normalizedSearch.length === 0} OR LOWER(c."container_no") LIKE ${searchPattern} ESCAPE '\\')
      GROUP BY c."id", c."container_no", c."status", c."created_at"
    `;

    const items = rows.map((row) => this.toItem(row));
    items.sort((left, right) => this.compare(left, right, query));
    return { items };
  }

  private toItem(row: ContainerIndexRow): ContainerIndexItemDto {
    const activeTotalPallets = Number(row.activeTotalPallets);
    const loadedPallets = Number(row.loadedPallets);
    return {
      activeTotalPallets,
      adjustedOutPallets: Number(row.adjustedOutPallets),
      cancelledPallets: Number(row.cancelledPallets),
      containerId: row.containerId,
      containerNo: row.containerNo,
      createdAt: new Date(row.createdAt).toISOString(),
      loadedPallets,
      remainingPallets: Number(row.remainingPallets),
      status: effectiveStatus(
        row.storedStatus,
        activeTotalPallets,
        Number(row.effectiveLoadedPallets),
        row.hasLoadingSignal,
      ),
      totalPallets: Number(row.totalPallets),
    };
  }

  private compare(
    left: ContainerIndexItemDto,
    right: ContainerIndexItemDto,
    query: ContainerIndexQueryDto,
  ): number {
    const direction = query.direction === 'asc' ? 1 : -1;
    if (query.sort === 'createdAt') {
      const dateComparison = left.createdAt.localeCompare(right.createdAt);
      return dateComparison !== 0
        ? direction * dateComparison
        : left.containerId.localeCompare(right.containerId);
    }
    if (query.sort === 'containerNo') {
      const containerComparison = compareContainerNumbers(
        left.containerNo,
        right.containerNo,
      );
      if (containerComparison !== 0) return direction * containerComparison;
      const dateComparison = right.createdAt.localeCompare(left.createdAt);
      return dateComparison !== 0
        ? dateComparison
        : left.containerId.localeCompare(right.containerId);
    }

    const rankComparison = statusRank(left.status) - statusRank(right.status);
    if (rankComparison !== 0) return direction * rankComparison;
    const containerComparison = compareContainerNumbers(
      left.containerNo,
      right.containerNo,
    );
    return containerComparison !== 0
      ? direction * containerComparison
      : direction * left.containerId.localeCompare(right.containerId);
  }
}

function effectiveStatus(
  storedStatus: string,
  activeTotalPallets: number,
  loadedPallets: number,
  hasLoadingSignal: boolean,
): string {
  return effectiveContainerStatusFromAggregate(storedStatus, {
    activePalletCount: activeTotalPallets,
    hasLoadingSignal,
    loadedPalletCount: loadedPallets,
  });
}

function statusRank(status: string): number {
  return CONTAINER_STATUS_RANK.get(status) ?? CONTAINER_STATUS_RANK.size;
}
