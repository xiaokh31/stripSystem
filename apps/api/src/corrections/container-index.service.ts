import { Injectable } from '@nestjs/common';
import {
  ContainerIndexItemDto,
  ContainerIndexListResponseDto,
  ContainerIndexQueryDto,
} from './dto/container-index.dto';
import {
  escapeSqlLikePattern,
  normalizeContainerSearchValue,
} from '../common/container-search';
import { compareContainerOrder } from '../common/container-ordering';
import { effectiveContainerStatusFromAggregate } from '../common/container-lifecycle';
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
  hasGeneratedLabels: boolean;
  hasGeneratedReport: boolean;
}

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
        ) AS "hasLoadingSignal",
        EXISTS (
          SELECT 1
          FROM "generated_files" AS report
          WHERE report."container_id" = c."id"
            AND report."file_type" = 'EXCEL_REPORT'
            AND report."status" = 'GENERATED'
        ) AS "hasGeneratedReport",
        EXISTS (
          SELECT 1
          FROM "generated_files" AS label
          WHERE label."container_id" = c."id"
            AND label."file_type" = 'PALLET_LABEL_PDF'
            AND label."status" = 'GENERATED'
        ) AS "hasGeneratedLabels"
      FROM "containers" AS c
      LEFT JOIN "container_destinations" AS d ON d."container_id" = c."id"
      LEFT JOIN "pallets" AS p ON p."container_destination_id" = d."id"
      WHERE (${normalizedSearch.length === 0} OR LOWER(c."container_no") LIKE ${searchPattern} ESCAPE '\\')
      GROUP BY c."id", c."container_no", c."status", c."created_at"
    `;

    const items = rows
      .filter((row) => this.matchesLifecycle(row, query.lifecycleStatus))
      .filter((row) => this.matchesReview(row, query.review))
      .map((row) => this.toItem(row));
    items.sort((left, right) =>
      compareContainerOrder(left, right, query.sort, query.direction),
    );
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

  private matchesLifecycle(
    row: ContainerIndexRow,
    lifecycleStatus: ContainerIndexQueryDto['lifecycleStatus'],
  ): boolean {
    if (!lifecycleStatus) return true;
    return (
      effectiveStatus(
        row.storedStatus,
        Number(row.activeTotalPallets),
        Number(row.effectiveLoadedPallets),
        row.hasLoadingSignal,
      ) === lifecycleStatus
    );
  }

  private matchesReview(
    row: ContainerIndexRow,
    review: ContainerIndexQueryDto['review'],
  ): boolean {
    if (!review) return true;
    if (review === 'MISSING_REPORT') {
      return row.storedStatus !== 'ERROR' && !row.hasGeneratedReport;
    }
    return (
      ['REPORT_GENERATED', 'CORRECTED', 'PARSED'].includes(row.storedStatus) &&
      !row.hasGeneratedLabels
    );
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
