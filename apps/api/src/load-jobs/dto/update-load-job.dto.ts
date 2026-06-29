import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLoadJobLineDto } from './create-load-job.dto';

export class UpdateLoadJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  loadNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  truckNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  dockNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  destinationRegion?: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledDepartureAt?: string;

  @IsOptional()
  @IsIn(['PLANNED', 'IN_PROGRESS', 'COMPLETED'])
  status?: string;

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLoadJobLineDto)
  lines?: CreateLoadJobLineDto[];
}
