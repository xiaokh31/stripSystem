import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CorrectionTargetType } from '../../generated/prisma/enums';

const CORRECTION_TARGET_TYPES = Object.values(CorrectionTargetType);

export class ListCorrectionsQueryDto {
  @IsOptional()
  @IsIn(CORRECTION_TARGET_TYPES)
  targetType?: string;

  @IsOptional()
  @IsString()
  containerId?: string;

  @IsOptional()
  @IsString()
  containerDestinationId?: string;

  @IsOptional()
  @IsString()
  correctedById?: string;

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
