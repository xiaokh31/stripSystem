import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CONTAINER_SORT_DIRECTIONS,
  CONTAINER_SORT_FIELDS,
  type ContainerSortDirection,
  type ContainerSortField,
} from '../../common/container-ordering';
import { PalletStatus } from '../../generated/prisma/enums';

const PALLET_STATUSES = Object.values(PalletStatus);
export const INVENTORY_PAGE_SIZES = [5, 10, 20, 50] as const;
export type InventoryPageSize = (typeof INVENTORY_PAGE_SIZES)[number];

export class InventoryQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  containerNo?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  destinationCode?: string;

  @IsOptional()
  @IsIn(PALLET_STATUSES)
  status?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @Type(() => Number)
  @IsIn(INVENTORY_PAGE_SIZES)
  pageSize?: InventoryPageSize = 10;

  @IsIn(CONTAINER_SORT_FIELDS)
  sortBy?: ContainerSortField = 'createdAt';

  @IsIn(CONTAINER_SORT_DIRECTIONS)
  sortDirection?: ContainerSortDirection = 'desc';
}

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
