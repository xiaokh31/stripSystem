import { Type } from 'class-transformer';
import {
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateContainerDestinationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  destinationCode?: string;

  @IsOptional()
  @IsString()
  destinationType?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['CARTON', 'WOODEN_CRATE', 'UNKNOWN', 'UNSPECIFIED'])
  packageType?: string | null;

  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  manualPallets?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cartons?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  volume?: number;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  correctionNote?: string | null;

  @IsOptional()
  @IsString()
  correctedById?: string | null;
}
