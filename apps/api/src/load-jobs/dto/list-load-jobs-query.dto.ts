import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LoadJobStatus } from '../../generated/prisma/enums';
import {
  LOAD_JOB_LIST_SCOPES,
  type LoadJobListScope,
} from '../load-job-list-filter';

const LOAD_JOB_STATUSES = Object.values(LoadJobStatus);

export class ListLoadJobsQueryDto {
  @IsOptional()
  @IsString()
  containerId?: string;

  @IsOptional()
  @IsString()
  loadNo?: string;

  @IsOptional()
  @IsString()
  destinationRegion?: string;

  @IsOptional()
  @IsIn(LOAD_JOB_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(LOAD_JOB_LIST_SCOPES)
  scope?: LoadJobListScope;

  @IsOptional()
  @IsString()
  selectedId?: string;

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
