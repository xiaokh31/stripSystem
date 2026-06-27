import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLoadJobLineDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sourceText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  containerNo?: string;

  @IsOptional()
  @IsString()
  containerId?: string;

  @IsOptional()
  @IsString()
  containerDestinationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  destinationCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  plannedPallets?: number;

  @IsOptional()
  @IsBoolean()
  externalTransfer?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateLoadJobDto {
  @IsOptional()
  @IsString()
  containerId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  loadNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  truckNo?: string;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLoadJobLineDto)
  lines?: CreateLoadJobLineDto[];
}
