import { IsIn, IsOptional, IsString } from 'class-validator';
import { CorrectionTargetType } from '../../generated/prisma/enums';

const CORRECTION_TARGET_TYPES = Object.values(CorrectionTargetType);

export class CreateCorrectionDto {
  @IsIn(CORRECTION_TARGET_TYPES)
  targetType!: string;

  @IsOptional()
  @IsString()
  importFileId?: string;

  @IsOptional()
  @IsString()
  containerId?: string;

  @IsOptional()
  @IsString()
  containerLineId?: string;

  @IsOptional()
  @IsString()
  containerDestinationId?: string;

  @IsOptional()
  @IsString()
  palletId?: string;

  @IsOptional()
  @IsString()
  generatedFileId?: string;

  @IsString()
  fieldName!: string;

  @IsOptional()
  oldValue!: unknown;

  @IsOptional()
  newValue!: unknown;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  correctedById?: string | null;
}
