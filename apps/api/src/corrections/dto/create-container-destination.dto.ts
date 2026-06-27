import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateContainerDestinationDto {
  @IsString()
  @IsNotEmpty()
  destinationCode!: string;

  @IsOptional()
  @IsString()
  destinationType?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  cartons!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  volume!: number;

  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  manualPallets?: number | null;

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
