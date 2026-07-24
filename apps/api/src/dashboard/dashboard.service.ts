import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PERMISSIONS, ROLE_CODES } from '../auth/permissions';
import {
  ContainerStatus,
  ImportStatus,
  LoadJobStatus,
  PalletStatus,
  ParseStatus,
} from '../generated/prisma/enums';
import {
  operationalDayRangeUtc,
  operationalLocalDate,
  operationalTimeZone,
} from '../common/operational-time';
import { ContainerIndexService } from '../corrections/container-index.service';
import { importListWhere } from '../imports/import-list-filter';
import { attendanceImportListWhere } from '../attendance/attendance-import-list-filter';
import { loadJobListWhere } from '../load-jobs/load-job-list-filter';
import { OperationsReviewService } from './operations-review.service';
import { unloadingWageSettlementWhere } from '../unloading-wage/unloading-wage-settlement-filter';
import { PrismaService } from '../prisma/prisma.service';
import {
  DashboardContainerLifecycleDto,
  DashboardExceptionItemDto,
  DashboardInventoryDto,
  DashboardLoadJobsDto,
  DashboardMonthlySummaryDto,
  DashboardRecentActivityItemDto,
  DashboardSeverity,
  DashboardWageAndAttendanceDto,
  DashboardWorkQueueDto,
  HiddenDashboardSectionDto,
  OperationsDashboardResponseDto,
} from './dto/operations-dashboard-response.dto';
import {
  DashboardOperationsQueryDto,
  DashboardRange,
} from './dto/dashboard-query.dto';

const COMPLETED_UNLOADING_STATUS_VALUES = [
  ContainerStatus.UNLOADED,
  ContainerStatus.LOADING_IN_PROGRESS,
  ContainerStatus.LOADED,
] as const;

const COMPLETED_UNLOADING_STATUSES = new Set<string>(
  COMPLETED_UNLOADING_STATUS_VALUES,
);

const CONTAINER_LIFECYCLE_STAGES = [
  {
    code: 'UPLOADED',
    labelKey: 'dashboard.lifecycle.uploaded',
    href: '/imports?importStatus=UPLOADED&parseStatus=NOT_PARSED&from=dashboard&code=UPLOADED',
  },
  {
    code: ContainerStatus.PARSED,
    labelKey: 'dashboard.lifecycle.parsed',
    href: '/containers?lifecycleStatus=PARSED&from=dashboard&code=PARSED',
  },
  {
    code: ContainerStatus.REPORT_GENERATED,
    labelKey: 'dashboard.lifecycle.reportGenerated',
    href: '/containers?lifecycleStatus=REPORT_GENERATED&from=dashboard&code=REPORT_GENERATED',
  },
  {
    code: ContainerStatus.LABELS_GENERATED,
    labelKey: 'dashboard.lifecycle.labelsGenerated',
    href: '/containers?lifecycleStatus=LABELS_GENERATED&from=dashboard&code=LABELS_GENERATED',
  },
  {
    code: ContainerStatus.UNLOADED,
    labelKey: 'dashboard.lifecycle.unloaded',
    href: '/containers?lifecycleStatus=UNLOADED&from=dashboard&code=UNLOADED',
  },
  {
    code: ContainerStatus.LOADING_IN_PROGRESS,
    labelKey: 'dashboard.lifecycle.loadingInProgress',
    href: '/containers?lifecycleStatus=LOADING_IN_PROGRESS&from=dashboard&code=LOADING_IN_PROGRESS',
  },
  {
    code: ContainerStatus.LOADED,
    labelKey: 'dashboard.lifecycle.deliveredToDestination',
    href: '/containers?lifecycleStatus=LOADED&from=dashboard&code=LOADED',
  },
] as const;

interface InventoryDestinationRecord {
  destinationCode: string;
  pallets: Array<{
    status: string;
  }>;
}

interface LoadJobRecord {
  id: string;
  jobNo: string | null;
  truckNo: string | null;
  dockNo: string | null;
  status: string;
  scheduledDepartureAt: Date | string | null;
  lines: Array<{
    plannedPallets: number;
    externalTransfer: boolean;
  }>;
  pallets: Array<{
    status: string;
  }>;
}

interface PayContainerSummaryRecord {
  id: string;
  completedAt: Date | string | null;
  status: string;
  sourceContainers: Array<{
    container: {
      id: string;
      status: string;
      destinations: unknown[];
    };
  }>;
}

interface RecentImportRecord {
  id: string;
  originalFilename: string;
  parseStatus: string;
  createdAt: Date | string;
}

interface RecentContainerRecord {
  id: string;
  containerNo: string;
  status: string;
  updatedAt: Date | string;
}

interface RecentGeneratedFileRecord {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  status: string;
  updatedAt: Date | string;
}

interface RecentCorrectionRecord {
  id: string;
  targetType: string;
  importFileId: string | null;
  containerId: string | null;
  generatedFileId: string | null;
  fieldName: string;
  createdAt: Date | string;
}

interface RecentLoadJobRecord {
  id: string;
  jobNo: string | null;
  status: string;
  updatedAt: Date | string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly containerIndexService: ContainerIndexService,
    private readonly operationsReviewService: OperationsReviewService,
  ) {}

  async operations(
    query: DashboardOperationsQueryDto,
    user: AuthenticatedUser,
  ): Promise<OperationsDashboardResponseDto> {
    const range = query.range;
    const month = query.month ?? (await this.defaultMonth());
    const permissions = this.permissions(user);
    const [health, workQueue, containerLifecycle, exceptionQueue] =
      await Promise.all([
        this.health(),
        this.workQueue(permissions),
        this.containerLifecycle(permissions),
        this.exceptionQueue(permissions),
      ]);
    const [inventory, loadJobs, monthlySummary, wageAndAttendance, recent] =
      await Promise.all([
        this.inventory(permissions),
        this.loadJobs(permissions),
        this.monthlySummary(month, permissions),
        this.wageAndAttendance(permissions),
        this.recentActivity(range, permissions),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      timeZone: operationalTimeZone(),
      range,
      month,
      hiddenSections: this.hiddenSections(permissions),
      health,
      workQueue,
      containerLifecycle,
      inventory,
      loadJobs,
      exceptionQueue,
      monthlySummary,
      wageAndAttendance,
      recentActivity: recent,
    };
  }

  private async health(): Promise<OperationsDashboardResponseDto['health']> {
    const database = await this.prisma.checkConnection();
    return {
      apiStatus: database.status === 'up' ? 'ok' : 'degraded',
      databaseStatus: database.status,
      version: this.configService.get<string>('app.version') ?? '0.0.1',
    };
  }

  private async workQueue(
    permissions: Set<string>,
  ): Promise<DashboardWorkQueueDto> {
    const items: DashboardWorkQueueDto['items'] = [];

    if (this.canReadImports(permissions)) {
      items.push(
        this.queueItem(
          'IMPORTS_AWAITING_PARSE',
          'dashboard.workQueue.importsAwaitingParse',
          await this.prisma.importFile.count({
            where: importListWhere({
              importStatus: ImportStatus.UPLOADED,
              parseStatus: ParseStatus.NOT_PARSED,
            }),
          }),
          'attention',
          '/imports?importStatus=UPLOADED&parseStatus=NOT_PARSED&from=dashboard&code=IMPORTS_AWAITING_PARSE',
        ),
        this.queueItem(
          'IMPORTS_PARSE_FAILED',
          'dashboard.workQueue.importsParseFailed',
          await this.prisma.importFile.count({
            where: importListWhere({ parseStatus: ParseStatus.ERROR }),
          }),
          'blocked',
          '/imports?parseStatus=ERROR&from=dashboard&code=IMPORTS_PARSE_FAILED',
        ),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.containers.read])) {
      items.push(
        this.queueItem(
          'CONTAINERS_MISSING_REPORT',
          'dashboard.workQueue.containersMissingReport',
          (
            await this.containerIndexService.list({
              review: 'MISSING_REPORT',
              sort: 'createdAt',
              direction: 'desc',
            })
          ).items.length,
          'attention',
          '/containers?review=MISSING_REPORT&from=dashboard&code=CONTAINERS_MISSING_REPORT',
        ),
        this.queueItem(
          'CONTAINERS_MISSING_LABELS',
          'dashboard.workQueue.containersMissingLabels',
          (
            await this.containerIndexService.list({
              review: 'MISSING_LABELS',
              sort: 'createdAt',
              direction: 'desc',
            })
          ).items.length,
          'attention',
          '/containers?review=MISSING_LABELS&from=dashboard&code=CONTAINERS_MISSING_LABELS',
        ),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.loadJobs.read])) {
      const openLoadJobs = await this.prisma.loadJob.count({
        where: loadJobListWhere({ scope: 'OPEN' }),
      });
      items.push(
        this.queueItem(
          'OPEN_LOAD_JOBS',
          'dashboard.workQueue.openLoadJobs',
          openLoadJobs,
          openLoadJobs > 0 ? 'attention' : 'normal',
          '/load-jobs?scope=OPEN&from=dashboard&code=OPEN_LOAD_JOBS',
        ),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.unloadingSummary.read])) {
      items.push(
        this.queueItem(
          'UNLOADING_COMPLETION_DATE_MISSING',
          'dashboard.workQueue.unloadingCompletionDateMissing',
          await this.missingCompletionReviewCount(),
          'blocked',
          '/operations/review?code=UNLOADING_COMPLETION_DATE_MISSING&from=dashboard',
        ),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.attendance.read])) {
      items.push(
        this.queueItem(
          'ATTENDANCE_IMPORTS_NEED_PARSE',
          'dashboard.workQueue.attendanceImportsNeedParse',
          await this.prisma.attendanceImport.count({
            where: attendanceImportListWhere({
              parseStatus: ParseStatus.NOT_PARSED,
            }),
          }),
          'attention',
          '/work-hours?parseStatus=NOT_PARSED&from=dashboard&code=ATTENDANCE_IMPORTS_NEED_PARSE',
        ),
      );
    }

    return {
      totalActions: items.reduce((total, item) => total + item.count, 0),
      items,
    };
  }

  private async containerLifecycle(
    permissions: Set<string>,
  ): Promise<DashboardContainerLifecycleDto> {
    if (
      !this.hasAny(permissions, [
        PERMISSIONS.imports.read,
        PERMISSIONS.containers.read,
      ])
    ) {
      return { totalContainers: 0, stages: [] };
    }

    const [uploadedImports, containerIndex] =
      await Promise.all([
        this.canReadImports(permissions)
          ? this.prisma.importFile.count({
              where: importListWhere({
                importStatus: ImportStatus.UPLOADED,
                parseStatus: ParseStatus.NOT_PARSED,
              }),
            })
          : 0,
        this.hasAny(permissions, [PERMISSIONS.containers.read])
          ? this.containerIndexService.list({
              sort: 'createdAt',
              direction: 'desc',
            })
          : { items: [] },
      ]);
    const statusCounts = new Map<string, number>();
    for (const container of containerIndex.items) {
      statusCounts.set(
        container.status,
        (statusCounts.get(container.status) ?? 0) + 1,
      );
    }

    return {
      totalContainers: containerIndex.items.length,
      stages: CONTAINER_LIFECYCLE_STAGES.map((stage) => ({
        code: stage.code,
        labelKey: stage.labelKey,
        count:
          stage.code === 'UPLOADED'
            ? uploadedImports
            : (statusCounts.get(stage.code) ?? 0),
        href: stage.href,
        severity: this.lifecycleSeverity(stage.code),
      })),
    };
  }

  private async inventory(
    permissions: Set<string>,
  ): Promise<DashboardInventoryDto | null> {
    if (!this.hasAny(permissions, [PERMISSIONS.inventory.read])) {
      return null;
    }

    const destinations = (await this.prisma.containerDestination.findMany({
      select: {
        destinationCode: true,
        pallets: {
          select: { status: true },
        },
      },
    })) as InventoryDestinationRecord[];
    const byDestination = new Map<
      string,
      DashboardInventoryDto['topDestinations'][number]
    >();
    const totals = {
      totalPallets: 0,
      activeTotalPallets: 0,
      loadedPallets: 0,
      remainingPallets: 0,
    };

    for (const destination of destinations) {
      const stats = this.palletStats(destination.pallets);
      totals.totalPallets += stats.totalPallets;
      totals.activeTotalPallets += stats.activeTotalPallets;
      totals.loadedPallets += stats.loadedPallets;
      totals.remainingPallets += stats.remainingPallets;
      const existing = byDestination.get(destination.destinationCode);
      if (existing) {
        existing.totalPallets += stats.totalPallets;
        existing.activeTotalPallets += stats.activeTotalPallets;
        existing.loadedPallets += stats.loadedPallets;
        existing.remainingPallets += stats.remainingPallets;
        continue;
      }
      byDestination.set(destination.destinationCode, {
        destinationCode: destination.destinationCode,
        ...stats,
        href: `/inventory?scope=REMAINING&destinationCode=${encodeURIComponent(destination.destinationCode)}&from=dashboard&code=INVENTORY_DESTINATION_REMAINING`,
      });
    }

    return {
      ...totals,
      hrefs: {
        active: '/inventory?scope=ACTIVE&from=dashboard&code=INVENTORY_ACTIVE',
        loaded: '/inventory?scope=LOADED&from=dashboard&code=INVENTORY_LOADED',
        remaining:
          '/inventory?scope=REMAINING&from=dashboard&code=INVENTORY_REMAINING',
      },
      topDestinations: [...byDestination.values()]
        .sort(
          (left, right) =>
            right.remainingPallets - left.remainingPallets ||
            left.destinationCode.localeCompare(right.destinationCode),
        )
        .slice(0, 8),
    };
  }

  private async loadJobs(
    permissions: Set<string>,
  ): Promise<DashboardLoadJobsDto | null> {
    if (!this.hasAny(permissions, [PERMISSIONS.loadJobs.read])) {
      return null;
    }

    const [openCount, inProgressCount, dueTodayCount, activeJobs] =
      await Promise.all([
        this.prisma.loadJob.count({
          where: loadJobListWhere({ scope: 'OPEN' }),
        }),
        this.prisma.loadJob.count({
          where: loadJobListWhere({ scope: 'IN_PROGRESS' }),
        }),
        this.prisma.loadJob.count({
          where: loadJobListWhere({ scope: 'DUE_TODAY' }),
        }),
        this.prisma.loadJob.findMany({
          where: {
            status: {
              in: [LoadJobStatus.PLANNED, LoadJobStatus.IN_PROGRESS],
            },
          },
          include: {
            lines: true,
            pallets: { select: { status: true } },
          },
          orderBy: [{ scheduledDepartureAt: 'asc' }, { createdAt: 'desc' }],
          take: 8,
        }),
      ]);

    return {
      openCount,
      inProgressCount,
      dueTodayCount,
      hrefs: {
        dueToday:
          '/load-jobs?scope=DUE_TODAY&from=dashboard&code=LOAD_JOBS_DUE_TODAY',
        inProgress:
          '/load-jobs?scope=IN_PROGRESS&from=dashboard&code=LOAD_JOBS_IN_PROGRESS',
        open: '/load-jobs?scope=OPEN&from=dashboard&code=OPEN_LOAD_JOBS',
      },
      activeJobs: (activeJobs as LoadJobRecord[]).map((job) =>
        this.toLoadJob(job),
      ),
    };
  }

  private async exceptionQueue(
    permissions: Set<string>,
  ): Promise<DashboardExceptionItemDto[]> {
    const items: DashboardExceptionItemDto[] = [];

    if (this.canReadImports(permissions)) {
      items.push(
        this.exceptionItem(
          'PARSER_ERRORS',
          'dashboard.exceptions.parserErrors',
          await this.prisma.importFile.count({
            where: importListWhere({ parseStatus: ParseStatus.ERROR }),
          }),
          'blocked',
          '/imports?parseStatus=ERROR&from=dashboard&code=PARSER_ERRORS',
        ),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.containers.read])) {
      items.push(
        this.exceptionItem(
          'DESTINATION_CARTON_VOLUME_MISSING',
          'dashboard.exceptions.destinationCartonVolumeMissing',
          await this.operationsReviewService.count(
            'DESTINATION_CARTON_VOLUME_MISSING',
          ),
          'attention',
          '/operations/review?code=DESTINATION_CARTON_VOLUME_MISSING&from=dashboard',
        ),
        this.exceptionItem(
          'ZERO_VOLUME_WITH_CARTONS',
          'dashboard.exceptions.zeroVolumeWithCartons',
          await this.operationsReviewService.count('ZERO_VOLUME_WITH_CARTONS'),
          'attention',
          '/operations/review?code=ZERO_VOLUME_WITH_CARTONS&from=dashboard',
        ),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.reports.read])) {
      items.push(
        this.exceptionItem(
          'FAILED_GENERATED_FILES',
          'dashboard.exceptions.failedGeneratedFiles',
          await this.operationsReviewService.count('FAILED_GENERATED_FILES'),
          'blocked',
          '/operations/review?code=FAILED_GENERATED_FILES&from=dashboard',
        ),
      );
    }

    if (
      this.hasAny(permissions, [
        PERMISSIONS.loadJobs.read,
        PERMISSIONS.scan.create,
      ])
    ) {
      items.push(
        this.exceptionItem(
          'SCAN_EXCEPTIONS',
          'dashboard.exceptions.scanExceptions',
          await this.operationsReviewService.count('SCAN_EXCEPTIONS'),
          'attention',
          '/operations/review?code=SCAN_EXCEPTIONS&from=dashboard',
        ),
      );
    }

    if (
      this.hasAny(permissions, [
        PERMISSIONS.imports.read,
        PERMISSIONS.reports.read,
      ])
    ) {
      items.push(
        this.exceptionItem(
          'FAILED_ASYNC_JOBS',
          'dashboard.exceptions.failedAsyncJobs',
          await this.operationsReviewService.count('FAILED_ASYNC_JOBS'),
          'blocked',
          '/operations/review?code=FAILED_ASYNC_JOBS&from=dashboard',
        ),
      );
    }

    return items;
  }

  private async monthlySummary(
    month: string,
    permissions: Set<string>,
  ): Promise<DashboardMonthlySummaryDto | null> {
    if (!this.hasAny(permissions, [PERMISSIONS.unloadingSummary.read])) {
      return null;
    }

    const payContainers = (await this.prisma.payContainer.findMany({
      where: { completedAt: this.monthRange(month) },
      include: {
        sourceContainers: {
          include: {
            container: {
              include: {
                destinations: true,
              },
            },
          },
        },
      },
    })) as PayContainerSummaryRecord[];
    const containerIds = new Set<string>();
    let rowCount = 0;

    for (const payContainer of payContainers) {
      if (!payContainer.completedAt) {
        continue;
      }
      for (const source of payContainer.sourceContainers ?? []) {
        const container = source.container;
        if (!COMPLETED_UNLOADING_STATUSES.has(container.status)) {
          continue;
        }
        if (containerIds.has(container.id)) {
          continue;
        }
        containerIds.add(container.id);
        rowCount += Math.max(1, container.destinations.length);
      }
    }

    return {
      month,
      completedContainerCount: containerIds.size,
      rowCount,
      reviewWarningCount: await this.missingCompletionReviewCount(),
      href: `/unloading-summary?month=${month}`,
      hrefs: {
        completedContainers: `/unloading-summary?month=${month}&focus=completedContainers&from=dashboard&code=MONTHLY_COMPLETED_CONTAINERS#completed-containers`,
        reviewWarnings:
          '/operations/review?code=UNLOADING_COMPLETION_DATE_MISSING&from=dashboard',
        summaryRows: `/unloading-summary?month=${month}&focus=summaryRows&from=dashboard&code=MONTHLY_SUMMARY_ROWS#summary-rows`,
      },
    };
  }

  private async wageAndAttendance(
    permissions: Set<string>,
  ): Promise<DashboardWageAndAttendanceDto | null> {
    const canReadAttendance = this.hasAny(permissions, [
      PERMISSIONS.attendance.read,
    ]);
    const canReadUnloadingWage = this.hasAny(permissions, [
      PERMISSIONS.unloadingWage.read,
    ]);
    if (!canReadAttendance && !canReadUnloadingWage) {
      return null;
    }

    const [
      attendanceImportsNeedingParse,
      attendanceImportsWithErrors,
      wageSettlementsNeedingReview,
    ] = await Promise.all([
      canReadAttendance
        ? this.prisma.attendanceImport.count({
            where: attendanceImportListWhere({
              parseStatus: ParseStatus.NOT_PARSED,
            }),
          })
        : Promise.resolve(null),
      canReadAttendance
        ? this.prisma.attendanceImport.count({
            where: attendanceImportListWhere({
              parseStatus: ParseStatus.ERROR,
            }),
          })
        : Promise.resolve(null),
      canReadUnloadingWage
        ? this.prisma.unloadingWageSettlement.count({
            where: unloadingWageSettlementWhere('NEEDS_REVIEW'),
          })
        : Promise.resolve(null),
    ]);

    return {
      attendanceImportsNeedingParse,
      attendanceImportsWithErrors,
      wageSettlementsNeedingReview,
      hrefs: {
        attendance:
          '/work-hours?parseStatus=NOT_PARSED&from=dashboard&code=ATTENDANCE_IMPORTS_NEED_PARSE',
        attendanceErrors:
          '/work-hours?parseStatus=ERROR&from=dashboard&code=ATTENDANCE_IMPORTS_WITH_ERRORS',
        unloadingWage:
          '/unloading-wage?review=NEEDS_REVIEW&from=dashboard&code=WAGE_SETTLEMENTS_NEED_REVIEW',
      },
    };
  }

  private async recentActivity(
    range: DashboardRange,
    permissions: Set<string>,
  ): Promise<DashboardRecentActivityItemDto[]> {
    const since = this.rangeStart(range);
    const activities: DashboardRecentActivityItemDto[] = [];

    if (this.canReadImports(permissions)) {
      const records = (await this.prisma.importFile.findMany({
        where: { deletedAt: null, createdAt: { gte: since } },
        select: {
          id: true,
          originalFilename: true,
          parseStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      })) as RecentImportRecord[];
      activities.push(
        ...records.map((record) => ({
          id: record.id,
          kind: 'IMPORT' as const,
          label: record.originalFilename,
          status: record.parseStatus,
          occurredAt: this.isoDate(record.createdAt),
          href: `/imports/${record.id}`,
        })),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.containers.read])) {
      const records = (await this.prisma.container.findMany({
        where: { updatedAt: { gte: since } },
        select: {
          id: true,
          containerNo: true,
          status: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      })) as RecentContainerRecord[];
      activities.push(
        ...records.map((record) => ({
          id: record.id,
          kind: 'CONTAINER' as const,
          label: record.containerNo,
          status: record.status,
          occurredAt: this.isoDate(record.updatedAt),
          href: `/containers/${record.id}`,
        })),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.reports.read])) {
      const records = (await this.prisma.generatedFile.findMany({
        where: { updatedAt: { gte: since } },
        select: {
          id: true,
          importFileId: true,
          containerId: true,
          fileType: true,
          status: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      })) as RecentGeneratedFileRecord[];
      activities.push(
        ...records.map((record) => ({
          id: record.id,
          kind: 'GENERATED_FILE' as const,
          label: record.fileType,
          status: record.status,
          occurredAt: this.isoDate(record.updatedAt),
          href: this.generatedFileHref(record),
        })),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.corrections.read])) {
      const records = (await this.prisma.correctionFeedback.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          targetType: true,
          importFileId: true,
          containerId: true,
          generatedFileId: true,
          fieldName: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      })) as RecentCorrectionRecord[];
      activities.push(
        ...records.map((record) => ({
          id: record.id,
          kind: 'CORRECTION' as const,
          label: record.fieldName,
          status: record.targetType,
          occurredAt: this.isoDate(record.createdAt),
          href: this.correctionHref(record),
        })),
      );
    }

    if (this.hasAny(permissions, [PERMISSIONS.loadJobs.read])) {
      const records = (await this.prisma.loadJob.findMany({
        where: { updatedAt: { gte: since } },
        select: {
          id: true,
          jobNo: true,
          status: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      })) as RecentLoadJobRecord[];
      activities.push(
        ...records.map((record) => ({
          id: record.id,
          kind: 'LOAD_JOB' as const,
          label: record.jobNo ?? record.id,
          status: record.status,
          occurredAt: this.isoDate(record.updatedAt),
          href: `/load-jobs?selectedId=${encodeURIComponent(record.id)}&from=dashboard&code=RECENT_LOAD_JOB`,
        })),
      );
    }

    return activities
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 10);
  }

  private hiddenSections(
    permissions: Set<string>,
  ): HiddenDashboardSectionDto[] {
    const sections: Array<[string, string[]]> = [
      ['workQueue', this.anyWorkQueuePermissions()],
      [
        'containerLifecycle',
        [PERMISSIONS.imports.read, PERMISSIONS.containers.read],
      ],
      ['inventory', [PERMISSIONS.inventory.read]],
      ['loadJobs', [PERMISSIONS.loadJobs.read]],
      ['exceptionQueue', this.anyExceptionPermissions()],
      ['monthlySummary', [PERMISSIONS.unloadingSummary.read]],
      ['wageAndAttendance.attendance', [PERMISSIONS.attendance.read]],
      ['wageAndAttendance.unloadingWage', [PERMISSIONS.unloadingWage.read]],
      ['recentActivity', this.anyRecentActivityPermissions()],
    ];

    return sections
      .filter(([, required]) => !this.hasAny(permissions, required))
      .map(([code, requiredPermissions]) => ({
        code,
        requiredPermissions,
      }));
  }

  private async defaultMonth(): Promise<string> {
    const latest = (await this.prisma.payContainer.findFirst({
      where: { completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    })) as { completedAt: Date | string | null } | null;

    return latest?.completedAt
      ? this.monthKey(latest.completedAt)
      : operationalLocalDate().slice(0, 7);
  }

  private async missingCompletionReviewCount(): Promise<number> {
    return this.operationsReviewService.count(
      'UNLOADING_COMPLETION_DATE_MISSING',
    );
  }

  private queueItem(
    code: string,
    labelKey: string,
    count: number,
    severity: DashboardSeverity,
    href: string,
  ): DashboardWorkQueueDto['items'][number] {
    return { code, labelKey, count, severity, href };
  }

  private exceptionItem(
    code: string,
    labelKey: string,
    count: number,
    severity: DashboardExceptionItemDto['severity'],
    href: string,
  ): DashboardExceptionItemDto {
    return { code, labelKey, count, severity, href };
  }

  private lifecycleSeverity(code: string): DashboardSeverity {
    if (code === ContainerStatus.LOADED || code === ContainerStatus.UNLOADED) {
      return 'normal';
    }
    if (code === 'UPLOADED') {
      return 'attention';
    }
    return 'normal';
  }

  private palletStats(pallets: Array<{ status: string }>): {
    totalPallets: number;
    activeTotalPallets: number;
    loadedPallets: number;
    remainingPallets: number;
  } {
    const totalPallets = pallets.length;
    const loadedPallets = pallets.filter(
      (pallet) => pallet.status === PalletStatus.LOADED,
    ).length;
    const activeTotalPallets = pallets.filter(
      (pallet) =>
        pallet.status !== PalletStatus.CANCELLED &&
        pallet.status !== PalletStatus.ADJUSTED_OUT,
    ).length;
    const remainingPallets = pallets.filter(
      (pallet) =>
        pallet.status !== PalletStatus.LOADED &&
        pallet.status !== PalletStatus.CANCELLED &&
        pallet.status !== PalletStatus.ADJUSTED_OUT,
    ).length;
    return {
      totalPallets,
      activeTotalPallets,
      loadedPallets,
      remainingPallets,
    };
  }

  private toLoadJob(
    job: LoadJobRecord,
  ): DashboardLoadJobsDto['activeJobs'][number] {
    const totalPallets = job.lines
      .filter((line) => !line.externalTransfer)
      .reduce((total, line) => total + line.plannedPallets, 0);
    const loadedPallets = job.pallets.filter(
      (pallet) => pallet.status === PalletStatus.LOADED,
    ).length;

    return {
      id: job.id,
      loadNumber: job.jobNo ?? job.id,
      status: job.status,
      truckNo: job.truckNo,
      dockNo: job.dockNo,
      scheduledDepartureAt: this.isoDateOrNull(job.scheduledDepartureAt),
      totalPallets,
      loadedPallets,
      remainingPallets: Math.max(0, totalPallets - loadedPallets),
      href: `/load-jobs?selectedId=${encodeURIComponent(job.id)}&from=dashboard&code=ACTIVE_LOAD_JOB`,
    };
  }

  private generatedFileHref(record: RecentGeneratedFileRecord): string {
    if (record.containerId) {
      return `/containers/${record.containerId}?fileId=${encodeURIComponent(record.id)}#generated-files`;
    }
    return `/operations/review?code=GENERATED_FILE_DETAIL&recordId=${encodeURIComponent(record.id)}`;
  }

  private correctionHref(record: RecentCorrectionRecord): string {
    if (record.containerId) {
      return `/containers/${record.containerId}/corrections?correctionId=${encodeURIComponent(record.id)}#correction-history`;
    }
    return `/operations/review?code=CORRECTION_DETAIL&recordId=${encodeURIComponent(record.id)}`;
  }

  private permissions(user: AuthenticatedUser): Set<string> {
    if (user.roles.includes(ROLE_CODES.admin)) {
      return new Set(this.allDashboardPermissions());
    }
    return new Set(user.permissions);
  }

  private hasAny(
    permissions: Set<string>,
    required: readonly string[],
  ): boolean {
    return required.some((permission) => permissions.has(permission));
  }

  private canReadImports(permissions: Set<string>): boolean {
    return this.hasAny(permissions, [PERMISSIONS.imports.read]);
  }

  private anyWorkQueuePermissions(): string[] {
    return [
      PERMISSIONS.imports.read,
      PERMISSIONS.containers.read,
      PERMISSIONS.loadJobs.read,
      PERMISSIONS.unloadingSummary.read,
      PERMISSIONS.attendance.read,
    ];
  }

  private anyExceptionPermissions(): string[] {
    return [
      PERMISSIONS.imports.read,
      PERMISSIONS.containers.read,
      PERMISSIONS.reports.read,
      PERMISSIONS.loadJobs.read,
      PERMISSIONS.scan.create,
    ];
  }

  private anyRecentActivityPermissions(): string[] {
    return [
      PERMISSIONS.imports.read,
      PERMISSIONS.containers.read,
      PERMISSIONS.reports.read,
      PERMISSIONS.corrections.read,
      PERMISSIONS.loadJobs.read,
    ];
  }

  private allDashboardPermissions(): string[] {
    return [
      ...this.anyWorkQueuePermissions(),
      ...this.anyExceptionPermissions(),
      ...this.anyRecentActivityPermissions(),
      PERMISSIONS.inventory.read,
      PERMISSIONS.unloadingWage.read,
    ];
  }

  private todayRange(): { gte: Date; lt: Date } {
    return operationalDayRangeUtc();
  }

  private rangeStart(range: DashboardRange): Date {
    const { gte } = this.todayRange();
    const days = range === '30d' ? 30 : range === '7d' ? 7 : 1;
    return new Date(gte.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  }

  private monthRange(month: string): { gte: Date; lt: Date } {
    const [yearText, monthText] = month.split('-');
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    return {
      gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
      lt: new Date(Date.UTC(year, monthNumber, 1)),
    };
  }

  private monthKey(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  private isoDate(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private isoDateOrNull(value: Date | string | null): string | null {
    return value ? this.isoDate(value) : null;
  }
}
