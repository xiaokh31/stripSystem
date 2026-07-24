import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { ParseStatus } from '../../generated/prisma/enums';
import { ATTENDANCE_IMPORT_PARSE_STATUSES } from '../attendance-import-list-filter';

export class ListAttendanceImportsQueryDto {
  @IsOptional()
  @IsIn(ATTENDANCE_IMPORT_PARSE_STATUSES)
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
