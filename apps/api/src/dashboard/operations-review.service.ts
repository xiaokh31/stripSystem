import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PERMISSIONS, ROLE_CODES } from '../auth/permissions';
import type { Prisma } from '../generated/prisma/client';
import {
  AsyncJobStatus,
  ContainerStatus,
  GeneratedFileStatus,
  PalletEventType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  type OperationsReviewCode,
  type OperationsReviewItemDto,
  type OperationsReviewQueryDto,
  type OperationsReviewResponseDto,
} from './dto/operations-review-query.dto';

const COMPLETED_UNLOADING_STATUSES = [
  ContainerStatus.UNLOADED,
  ContainerStatus.LOADING_IN_PROGRESS,
  ContainerStatus.LOADED,
] as const;

export function missingCompletionDateWhere(): Prisma.ContainerWhereInput {
  return {
    status: { in: [...COMPLETED_UNLOADING_STATUSES] },
    payContainerLinks: {
      every: {
        payContainer: {
          completedAt: null,
        },
      },
    },
  };
}

@Injectable()
export class OperationsReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async count(code: OperationsReviewCode): Promise<number> {
    switch (code) {
      case 'UNLOADING_COMPLETION_DATE_MISSING':
        return this.prisma.container.count({
          where: missingCompletionDateWhere(),
        });
      case 'DESTINATION_CARTON_VOLUME_MISSING':
        return this.prisma.containerLine.count({
          where: {
            OR: [
              { destinationCode: null },
              { cartons: null },
              { volume: null },
            ],
          },
        });
      case 'ZERO_VOLUME_WITH_CARTONS':
        return this.prisma.containerLine.count({
          where: { cartons: { gt: 0 }, volume: 0 },
        });
      case 'FAILED_GENERATED_FILES': {
        const [generated, wage] = await Promise.all([
          this.prisma.generatedFile.count({
            where: { status: GeneratedFileStatus.FAILED },
          }),
          this.prisma.wageGeneratedFile.count({
            where: { status: GeneratedFileStatus.FAILED },
          }),
        ]);
        return generated + wage;
      }
      case 'SCAN_EXCEPTIONS':
        return this.prisma.palletEvent.count({
          where: {
            eventType: {
              in: [
                PalletEventType.INVALID_SCAN,
                PalletEventType.DUPLICATE_SCAN,
              ],
            },
          },
        });
      case 'FAILED_ASYNC_JOBS':
        return this.prisma.asyncJob.count({
          where: { status: AsyncJobStatus.FAILED },
        });
      case 'GENERATED_FILE_DETAIL':
      case 'CORRECTION_DETAIL':
        return 0;
    }
  }

  async list(
    query: OperationsReviewQueryDto,
    user: AuthenticatedUser,
  ): Promise<OperationsReviewResponseDto> {
    this.assertPermission(query.code, user);
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const { items, totalItems } = await this.records(
      query.code,
      query.recordId,
      offset,
      pageSize,
    );
    return {
      code: query.code,
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  private async records(
    code: OperationsReviewCode,
    recordId: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: OperationsReviewItemDto[]; totalItems: number }> {
    switch (code) {
      case 'UNLOADING_COMPLETION_DATE_MISSING': {
        const where = missingCompletionDateWhere();
        const [totalItems, records] = await Promise.all([
          this.prisma.container.count({ where }),
          this.prisma.container.findMany({
            where,
            select: {
              id: true,
              containerNo: true,
              status: true,
              updatedAt: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
          }),
        ]);
        return {
          totalItems,
          items: records.map((record) => ({
            id: record.id,
            code,
            sourceType: 'CONTAINER',
            targetId: record.id,
            primaryValue: record.containerNo,
            status: record.status,
            occurredAt: record.updatedAt.toISOString(),
            href: `/containers/${record.id}`,
            details: {},
          })),
        };
      }
      case 'DESTINATION_CARTON_VOLUME_MISSING':
      case 'ZERO_VOLUME_WITH_CARTONS': {
        const where: Prisma.ContainerLineWhereInput =
          code === 'ZERO_VOLUME_WITH_CARTONS'
            ? { cartons: { gt: 0 }, volume: 0 }
            : {
                OR: [
                  { destinationCode: null },
                  { cartons: null },
                  { volume: null },
                ],
              };
        const [totalItems, records] = await Promise.all([
          this.prisma.containerLine.count({ where }),
          this.prisma.containerLine.findMany({
            where,
            select: {
              id: true,
              lineNo: true,
              destinationCode: true,
              cartons: true,
              volume: true,
              updatedAt: true,
              container: { select: { id: true, containerNo: true } },
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
          }),
        ]);
        return {
          totalItems,
          items: records.map((record) => ({
            id: record.id,
            code,
            sourceType: 'CONTAINER_LINE',
            targetId: record.container.id,
            primaryValue: record.container.containerNo,
            status: null,
            occurredAt: record.updatedAt.toISOString(),
            href: `/containers/${record.container.id}?lineId=${encodeURIComponent(record.id)}#container-lines`,
            details: {
              lineNo: record.lineNo,
              destinationCode: record.destinationCode,
              cartons: record.cartons,
              volume: record.volume?.toString() ?? null,
            },
          })),
        };
      }
      case 'FAILED_GENERATED_FILES':
        return this.failedGeneratedFiles(code, skip, take);
      case 'SCAN_EXCEPTIONS': {
        const where = {
          eventType: {
            in: [
              PalletEventType.INVALID_SCAN,
              PalletEventType.DUPLICATE_SCAN,
            ],
          },
        };
        const [totalItems, records] = await Promise.all([
          this.prisma.palletEvent.count({ where }),
          this.prisma.palletEvent.findMany({
            where,
            select: {
              id: true,
              eventType: true,
              loadJobId: true,
              palletId: true,
              occurredAt: true,
              pallet: { select: { palletId: true } },
            },
            orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
          }),
        ]);
        return {
          totalItems,
          items: records.map((record) => ({
            id: record.id,
            code,
            sourceType: 'PALLET_EVENT',
            targetId: record.loadJobId ?? record.palletId,
            primaryValue: record.pallet?.palletId ?? null,
            status: record.eventType,
            occurredAt: record.occurredAt.toISOString(),
            href: record.loadJobId
              ? `/load-jobs?selectedId=${encodeURIComponent(record.loadJobId)}&eventId=${encodeURIComponent(record.id)}`
              : `/operations/review?code=SCAN_EXCEPTIONS&recordId=${encodeURIComponent(record.id)}`,
            details: {
              hasLoadJob: Boolean(record.loadJobId),
              hasPallet: Boolean(record.palletId),
            },
          })),
        };
      }
      case 'FAILED_ASYNC_JOBS': {
        const where = { status: AsyncJobStatus.FAILED };
        const [totalItems, records] = await Promise.all([
          this.prisma.asyncJob.count({ where }),
          this.prisma.asyncJob.findMany({
            where,
            select: {
              id: true,
              jobType: true,
              targetType: true,
              targetId: true,
              importFileId: true,
              containerId: true,
              attendanceImportId: true,
              updatedAt: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
          }),
        ]);
        return {
          totalItems,
          items: records.map((record) => ({
            id: record.id,
            code,
            sourceType: 'ASYNC_JOB',
            targetId: record.targetId,
            primaryValue: record.jobType,
            status: AsyncJobStatus.FAILED,
            occurredAt: record.updatedAt.toISOString(),
            href: this.asyncJobHref(record),
            details: {
              targetType: record.targetType,
            },
          })),
        };
      }
      case 'GENERATED_FILE_DETAIL':
        return this.generatedFileDetail(code, recordId);
      case 'CORRECTION_DETAIL':
        return this.correctionDetail(code, recordId);
    }
  }

  private async failedGeneratedFiles(
    code: OperationsReviewCode,
    skip: number,
    take: number,
  ): Promise<{ items: OperationsReviewItemDto[]; totalItems: number }> {
    const [generatedCount, wageCount, generated, wage] = await Promise.all([
      this.prisma.generatedFile.count({
        where: { status: GeneratedFileStatus.FAILED },
      }),
      this.prisma.wageGeneratedFile.count({
        where: { status: GeneratedFileStatus.FAILED },
      }),
      this.prisma.generatedFile.findMany({
        where: { status: GeneratedFileStatus.FAILED },
        select: {
          id: true,
          fileType: true,
          status: true,
          importFileId: true,
          containerId: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: skip + take,
      }),
      this.prisma.wageGeneratedFile.findMany({
        where: { status: GeneratedFileStatus.FAILED },
        select: {
          id: true,
          fileType: true,
          status: true,
          attendanceImportId: true,
          unloadingWageSettlementId: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: skip + take,
      }),
    ]);
    const items: OperationsReviewItemDto[] = [
      ...generated.map((record) => ({
        id: record.id,
        code,
        sourceType: 'GENERATED_FILE',
        targetId: record.containerId ?? record.importFileId,
        primaryValue: record.fileType,
        status: record.status,
        occurredAt: record.updatedAt.toISOString(),
        href: record.containerId
          ? `/containers/${record.containerId}?fileId=${encodeURIComponent(record.id)}#generated-files`
          : `/operations/review?code=GENERATED_FILE_DETAIL&recordId=${encodeURIComponent(record.id)}`,
        details: {},
      })),
      ...wage.map((record) => ({
        id: record.id,
        code,
        sourceType: 'WAGE_GENERATED_FILE',
        targetId:
          record.attendanceImportId ?? record.unloadingWageSettlementId,
        primaryValue: record.fileType,
        status: record.status,
        occurredAt: record.updatedAt.toISOString(),
        href: record.attendanceImportId
          ? `/operations/review?code=GENERATED_FILE_DETAIL&recordId=${encodeURIComponent(record.id)}`
          : record.unloadingWageSettlementId
            ? `/unloading-wage?settlementId=${encodeURIComponent(record.unloadingWageSettlementId)}&fileId=${encodeURIComponent(record.id)}`
            : `/operations/review?code=GENERATED_FILE_DETAIL&recordId=${encodeURIComponent(record.id)}`,
        details: {},
      })),
    ]
      .sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(skip, skip + take);
    return { items, totalItems: generatedCount + wageCount };
  }

  private async generatedFileDetail(
    code: OperationsReviewCode,
    recordId: string | undefined,
  ): Promise<{ items: OperationsReviewItemDto[]; totalItems: number }> {
    if (!recordId) return { items: [], totalItems: 0 };
    const [record, wageRecord] = await Promise.all([
      this.prisma.generatedFile.findUnique({
        where: { id: recordId },
        select: {
          id: true,
          fileType: true,
          status: true,
          importFileId: true,
          containerId: true,
          updatedAt: true,
        },
      }),
      this.prisma.wageGeneratedFile.findUnique({
        where: { id: recordId },
        select: {
          id: true,
          fileType: true,
          status: true,
          attendanceImportId: true,
          unloadingWageSettlementId: true,
          updatedAt: true,
        },
      }),
    ]);
    if (!record && !wageRecord) return { items: [], totalItems: 0 };
    if (wageRecord) {
      return {
        totalItems: 1,
        items: [
          {
            id: wageRecord.id,
            code,
            sourceType: 'WAGE_GENERATED_FILE',
            targetId:
              wageRecord.attendanceImportId ??
              wageRecord.unloadingWageSettlementId,
            primaryValue: wageRecord.fileType,
            status: wageRecord.status,
            occurredAt: wageRecord.updatedAt.toISOString(),
            href: wageRecord.attendanceImportId
              ? `/work-hours?attendanceImportId=${encodeURIComponent(wageRecord.attendanceImportId)}`
              : wageRecord.unloadingWageSettlementId
                ? `/unloading-wage?settlementId=${encodeURIComponent(wageRecord.unloadingWageSettlementId)}`
                : `/operations/review?code=${code}&recordId=${encodeURIComponent(wageRecord.id)}`,
            details: {},
          },
        ],
      };
    }
    if (!record) return { items: [], totalItems: 0 };
    return {
      totalItems: 1,
      items: [
        {
          id: record.id,
          code,
          sourceType: 'GENERATED_FILE',
          targetId: record.containerId ?? record.importFileId,
          primaryValue: record.fileType,
          status: record.status,
          occurredAt: record.updatedAt.toISOString(),
          href: record.containerId
            ? `/containers/${record.containerId}?fileId=${encodeURIComponent(record.id)}#generated-files`
            : record.importFileId
              ? `/imports/${record.importFileId}`
              : `/operations/review?code=${code}&recordId=${encodeURIComponent(record.id)}`,
          details: {},
        },
      ],
    };
  }

  private async correctionDetail(
    code: OperationsReviewCode,
    recordId: string | undefined,
  ): Promise<{ items: OperationsReviewItemDto[]; totalItems: number }> {
    if (!recordId) return { items: [], totalItems: 0 };
    const record = await this.prisma.correctionFeedback.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        targetType: true,
        fieldName: true,
        importFileId: true,
        containerId: true,
        createdAt: true,
      },
    });
    if (!record) return { items: [], totalItems: 0 };
    return {
      totalItems: 1,
      items: [
        {
          id: record.id,
          code,
          sourceType: 'CORRECTION',
          targetId: record.containerId ?? record.importFileId,
          primaryValue: record.fieldName,
          status: record.targetType,
          occurredAt: record.createdAt.toISOString(),
          href: record.containerId
            ? `/containers/${record.containerId}/corrections?correctionId=${encodeURIComponent(record.id)}#correction-history`
            : record.importFileId
              ? `/imports/${record.importFileId}`
              : `/operations/review?code=${code}&recordId=${encodeURIComponent(record.id)}`,
          details: {},
        },
      ],
    };
  }

  private asyncJobHref(record: {
    id: string;
    importFileId: string | null;
    containerId: string | null;
    attendanceImportId: string | null;
  }): string {
    if (record.containerId) return `/containers/${record.containerId}`;
    if (record.importFileId) return `/imports/${record.importFileId}`;
    if (record.attendanceImportId) {
      return `/work-hours?attendanceImportId=${encodeURIComponent(record.attendanceImportId)}`;
    }
    return `/operations/review?code=FAILED_ASYNC_JOBS&recordId=${encodeURIComponent(record.id)}`;
  }

  private assertPermission(
    code: OperationsReviewCode,
    user: AuthenticatedUser,
  ): void {
    if (user.roles.includes(ROLE_CODES.admin)) return;
    const required = this.requiredPermissions(code);
    if (required.some((permission) => user.permissions.includes(permission))) {
      return;
    }
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'The current user cannot access this operations review.',
    });
  }

  private requiredPermissions(code: OperationsReviewCode): string[] {
    if (
      code === 'DESTINATION_CARTON_VOLUME_MISSING' ||
      code === 'ZERO_VOLUME_WITH_CARTONS' ||
      code === 'UNLOADING_COMPLETION_DATE_MISSING'
    ) {
      return [PERMISSIONS.containers.read, PERMISSIONS.unloadingSummary.read];
    }
    if (
      code === 'FAILED_GENERATED_FILES' ||
      code === 'GENERATED_FILE_DETAIL'
    ) {
      return [PERMISSIONS.reports.read];
    }
    if (code === 'CORRECTION_DETAIL') {
      return [PERMISSIONS.corrections.read];
    }
    if (code === 'SCAN_EXCEPTIONS') {
      return [PERMISSIONS.loadJobs.read, PERMISSIONS.scan.create];
    }
    return [PERMISSIONS.imports.read, PERMISSIONS.reports.read];
  }
}
