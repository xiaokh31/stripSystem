import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CONTAINER_SORT_DIRECTIONS,
  CONTAINER_SORT_FIELDS,
  type ContainerSortDirection,
  type ContainerSortField,
} from '../../common/container-ordering';

export const CONTAINER_INDEX_SORT_FIELDS = CONTAINER_SORT_FIELDS;
export const SORT_DIRECTIONS = CONTAINER_SORT_DIRECTIONS;

export type ContainerIndexSortField = ContainerSortField;
export type SortDirection = ContainerSortDirection;

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
