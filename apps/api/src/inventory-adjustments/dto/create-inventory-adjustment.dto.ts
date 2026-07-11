import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryAdjustmentReasonCode } from '../../generated/prisma/enums';

export class CreateInventoryAdjustmentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  count?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  palletIds?: string[];

  @IsEnum(InventoryAdjustmentReasonCode)
  reasonCode!: InventoryAdjustmentReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
