import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const OPERATIONS_REVIEW_CODES = [
  'UNLOADING_COMPLETION_DATE_MISSING',
  'DESTINATION_CARTON_VOLUME_MISSING',
  'ZERO_VOLUME_WITH_CARTONS',
  'FAILED_GENERATED_FILES',
  'SCAN_EXCEPTIONS',
  'FAILED_ASYNC_JOBS',
  'GENERATED_FILE_DETAIL',
  'CORRECTION_DETAIL',
] as const;
export type OperationsReviewCode = (typeof OPERATIONS_REVIEW_CODES)[number];

export class OperationsReviewQueryDto {
  @IsIn(OPERATIONS_REVIEW_CODES)
  code!: OperationsReviewCode;

  @IsOptional()
  @IsString()
  recordId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export interface OperationsReviewItemDto {
  id: string;
  code: OperationsReviewCode;
  sourceType: string;
  targetId: string | null;
  primaryValue: string | null;
  status: string | null;
  occurredAt: string;
  href: string;
  details: Record<string, string | number | boolean | null>;
}

export interface OperationsReviewResponseDto {
  code: OperationsReviewCode;
  items: OperationsReviewItemDto[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
