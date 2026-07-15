import { ContainerStatus } from '../generated/prisma/enums';
import { compareContainerNumbers } from './container-search';

export const CONTAINER_SORT_FIELDS = [
  'createdAt',
  'containerNo',
  'status',
] as const;
export const CONTAINER_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type ContainerSortField = (typeof CONTAINER_SORT_FIELDS)[number];
export type ContainerSortDirection =
  (typeof CONTAINER_SORT_DIRECTIONS)[number];

export interface ContainerOrderValue {
  containerId: string;
  containerNo: string;
  createdAt: string;
  status: string;
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

export function compareContainerOrder(
  left: ContainerOrderValue,
  right: ContainerOrderValue,
  sort: ContainerSortField,
  direction: ContainerSortDirection,
): number {
  const directionMultiplier = direction === 'asc' ? 1 : -1;
  if (sort === 'createdAt') {
    const dateComparison = left.createdAt.localeCompare(right.createdAt);
    return dateComparison !== 0
      ? directionMultiplier * dateComparison
      : left.containerId.localeCompare(right.containerId);
  }
  if (sort === 'containerNo') {
    const containerComparison = compareContainerNumbers(
      left.containerNo,
      right.containerNo,
    );
    if (containerComparison !== 0) {
      return directionMultiplier * containerComparison;
    }
    const dateComparison = right.createdAt.localeCompare(left.createdAt);
    return dateComparison !== 0
      ? dateComparison
      : left.containerId.localeCompare(right.containerId);
  }

  const rankComparison = statusRank(left.status) - statusRank(right.status);
  if (rankComparison !== 0) return directionMultiplier * rankComparison;
  const containerComparison = compareContainerNumbers(
    left.containerNo,
    right.containerNo,
  );
  return containerComparison !== 0
    ? directionMultiplier * containerComparison
    : directionMultiplier * left.containerId.localeCompare(right.containerId);
}

function statusRank(status: string): number {
  return CONTAINER_STATUS_RANK.get(status) ?? CONTAINER_STATUS_RANK.size;
}
