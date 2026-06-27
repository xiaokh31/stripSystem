import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLoadJobDto {
  @IsString()
  @IsNotEmpty()
  containerId!: string;

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
}
