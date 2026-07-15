import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const CONTAINER_INDEX_SORT_FIELDS = [
  'createdAt',
  'containerNo',
  'status',
] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type ContainerIndexSortField =
  (typeof CONTAINER_INDEX_SORT_FIELDS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export class ContainerIndexQueryDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(64)
  containerNo?: string;

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
