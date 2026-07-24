import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  IMPORT_LIST_IMPORT_STATUSES,
  IMPORT_LIST_PARSE_STATUSES,
} from '../import-list-filter';
import type { ImportStatus, ParseStatus } from '../../generated/prisma/enums';

export class ListImportsQueryDto {
  @IsOptional()
  @IsIn(IMPORT_LIST_IMPORT_STATUSES)
  importStatus?: ImportStatus;

  @IsOptional()
  @IsIn(IMPORT_LIST_PARSE_STATUSES)
  parseStatus?: ParseStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
