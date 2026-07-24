import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CONTAINER_SORT_DIRECTIONS,
  CONTAINER_SORT_FIELDS,
  type ContainerSortDirection,
  type ContainerSortField,
} from '../../common/container-ordering';
import { ContainerStatus } from '../../generated/prisma/enums';

export const CONTAINER_INDEX_SORT_FIELDS = CONTAINER_SORT_FIELDS;
export const SORT_DIRECTIONS = CONTAINER_SORT_DIRECTIONS;

export type ContainerIndexSortField = ContainerSortField;
export type SortDirection = ContainerSortDirection;

export const CONTAINER_LIFECYCLE_FILTERS = [
  ContainerStatus.PARSED,
  ContainerStatus.REPORT_GENERATED,
  ContainerStatus.LABELS_GENERATED,
  ContainerStatus.UNLOADED,
  ContainerStatus.LOADING_IN_PROGRESS,
  ContainerStatus.LOADED,
] as const;
export type ContainerLifecycleFilter =
  (typeof CONTAINER_LIFECYCLE_FILTERS)[number];

export const CONTAINER_REVIEW_FILTERS = [
  'MISSING_REPORT',
  'MISSING_LABELS',
] as const;
export type ContainerReviewFilter = (typeof CONTAINER_REVIEW_FILTERS)[number];

export class ContainerIndexQueryDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(64)
  containerNo?: string;

  @IsOptional()
  @IsIn(CONTAINER_LIFECYCLE_FILTERS)
  lifecycleStatus?: ContainerLifecycleFilter;

  @IsOptional()
  @IsIn(CONTAINER_REVIEW_FILTERS)
  review?: ContainerReviewFilter;

  @IsOptional()
  @IsIn(CONTAINER_INDEX_SORT_FIELDS)
  sort: ContainerIndexSortField = 'createdAt';

  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  direction: SortDirection = 'desc';
}

export class ContainerIndexItemDto {
  containerId!: string;
  containerNo!: string;
  status!: string;
  createdAt!: string;
  totalPallets!: number;
  activeTotalPallets!: number;
  loadedPallets!: number;
  adjustedOutPallets!: number;
  cancelledPallets!: number;
  remainingPallets!: number;
}

export class ContainerIndexListResponseDto {
  items!: ContainerIndexItemDto[];
}
