import type { DashboardRange } from './dashboard-query.dto';

export type DashboardSeverity = 'normal' | 'attention' | 'blocked';

export interface HiddenDashboardSectionDto {
  code: string;
  requiredPermissions: string[];
}

export interface DashboardHealthDto {
  apiStatus: 'ok' | 'degraded';
  databaseStatus: 'up' | 'down';
  version: string;
}

export interface DashboardWorkQueueItemDto {
  code: string;
  labelKey: string;
  count: number;
  severity: DashboardSeverity;
  href: string;
}

export interface DashboardWorkQueueDto {
  totalActions: number;
  items: DashboardWorkQueueItemDto[];
}

export interface DashboardContainerLifecycleStageDto {
  code: string;
  labelKey: string;
  count: number;
  href: string;
  severity: DashboardSeverity;
}

export interface DashboardContainerLifecycleDto {
  totalContainers: number;
  stages: DashboardContainerLifecycleStageDto[];
}

export interface DashboardInventoryDestinationDto {
  destinationCode: string;
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
}

export interface DashboardInventoryDto {
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
  topDestinations: DashboardInventoryDestinationDto[];
}

export interface DashboardLoadJobDto {
  id: string;
  loadNumber: string;
  status: string;
  truckNo: string | null;
  dockNo: string | null;
  scheduledDepartureAt: string | null;
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
  href: string;
}

export interface DashboardLoadJobsDto {
  openCount: number;
  inProgressCount: number;
  dueTodayCount: number;
  activeJobs: DashboardLoadJobDto[];
}

export interface DashboardExceptionItemDto {
  code: string;
  labelKey: string;
  count: number;
  severity: Exclude<DashboardSeverity, 'normal'>;
  href: string;
}

export interface DashboardMonthlySummaryDto {
  month: string;
  completedContainerCount: number;
  rowCount: number;
  reviewWarningCount: number;
  href: string;
}

export interface DashboardWageAndAttendanceDto {
  attendanceImportsNeedingParse: number | null;
  attendanceImportsWithErrors: number | null;
  wageSettlementsNeedingReview: number | null;
  hrefs: Record<string, string>;
}

export type DashboardActivityKind =
  | 'IMPORT'
  | 'CONTAINER'
  | 'LOAD_JOB'
  | 'GENERATED_FILE'
  | 'CORRECTION';

export interface DashboardRecentActivityItemDto {
  id: string;
  kind: DashboardActivityKind;
  label: string;
  status: string;
  occurredAt: string;
  href: string;
}

export interface OperationsDashboardResponseDto {
  generatedAt: string;
  timeZone: string;
  range: DashboardRange;
  month: string;
  hiddenSections: HiddenDashboardSectionDto[];
  health: DashboardHealthDto;
  workQueue: DashboardWorkQueueDto;
  containerLifecycle: DashboardContainerLifecycleDto;
  inventory: DashboardInventoryDto | null;
  loadJobs: DashboardLoadJobsDto | null;
  exceptionQueue: DashboardExceptionItemDto[];
  monthlySummary: DashboardMonthlySummaryDto | null;
  wageAndAttendance: DashboardWageAndAttendanceDto | null;
  recentActivity: DashboardRecentActivityItemDto[];
}
