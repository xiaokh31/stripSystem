import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ContainerPayClassification,
  PayAllocationMethod,
} from '../../generated/prisma/enums';

const CLASSIFICATIONS = Object.values(ContainerPayClassification);
const ALLOCATION_METHODS = Object.values(PayAllocationMethod);

export class UpdateContainerPayClassificationDto {
  @IsIn(CLASSIFICATIONS)
  classification!: string;

  @IsOptional()
  @IsString()
  trailerNumber?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreatePayContainerDto {
  @IsIn(CLASSIFICATIONS)
  classification!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  containerIds!: string[];

  @IsOptional()
  @IsString()
  trailerNumber?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  rateAmount?: number;

  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class CompleteUnloadingUnloaderDto {
  @IsOptional()
  @IsString()
  workerUserId?: string | null;

  @IsString()
  workerCode!: string;

  @IsString()
  workerName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allocationAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allocationPercent?: number | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CompleteUnloadingDto {
  @IsISO8601()
  completedAt!: string;

  @IsIn(ALLOCATION_METHODS)
  allocationMethod: string = PayAllocationMethod.EQUAL_SPLIT;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompleteUnloadingUnloaderDto)
  unloaders!: CompleteUnloadingUnloaderDto[];

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class GenerateUnloadingWageSettlementDto {
  @Matches(/^\d{4}-\d{2}$/)
  settlementMonth!: string;
}

export interface PayContainerResponseDto {
  id: string;
  payContainerNo: string;
  classification: string;
  trailerNumber: string | null;
  status: string;
  currency: string;
  rateAmount: string;
  allocationMethod: string;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  containers: Array<{
    id: string;
    containerId: string;
    containerNo: string;
  }>;
  unloaders: Array<{
    id: string;
    workerUserId: string | null;
    workerCode: string;
    workerName: string;
    allocationAmount: string | null;
    allocationPercent: string | null;
    note: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface UnloadingWageSettlementResponseDto {
  id: string;
  settlementMonth: string;
  currency: string;
  status: string;
  totalAmount: string;
  warningCount: number;
  errorCount: number;
  workers: Array<{
    id: string;
    workerCode: string;
    workerName: string;
    payContainerCount: number;
    totalAmount: string;
  }>;
  lines: Array<{
    id: string;
    workerCode: string;
    workerName: string;
    payContainerNo: string;
    classification: string;
    trailerNumber: string | null;
    containerNumbers: unknown;
    amount: string;
  }>;
  generatedFiles: Array<{
    id: string;
    fileType: string;
    storagePath: string;
    fileSha256: string | null;
    status: string;
  }>;
  warnings: unknown[];
  errors: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface UnloadingWageSettlementListResponseDto {
  items: UnloadingWageSettlementResponseDto[];
}
