import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateManualContainerDestinationDto {
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
  @IsInt()
  @Min(1)
  pallets!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  volume?: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreateManualContainerDto {
  @IsString()
  @IsNotEmpty()
  containerNo!: string;

  @IsOptional()
  @IsString()
  dockNo?: string | null;

  @IsOptional()
  @IsString()
  company?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateManualContainerDestinationDto)
  destinations!: CreateManualContainerDestinationDto[];

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
