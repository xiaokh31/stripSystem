import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ContainerPayClassification,
  PayAllocationMethod,
  PayContainerStatus,
} from '../../generated/prisma/enums';

const CLASSIFICATIONS = Object.values(ContainerPayClassification);
const ALLOCATION_METHODS = Object.values(PayAllocationMethod);

function optionalBoolean({ value }: TransformFnParams): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return value as boolean;
}

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

export class SaveContainerUnloadingWageDto {
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

export class UpdateContainerUnloadingWageAssociationsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  associatedContainerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  associatedContainerNos?: string[];

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

export class CompleteContainerUnloadingDto {
  @IsISO8601()
  completedAt!: string;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class ContainerUnloaderDto {
  @IsOptional()
  @IsString()
  unloadingWorkerId?: string | null;

  @IsOptional()
  @IsString()
  workerUserId?: string | null;

  @IsOptional()
  @IsString()
  workerCode?: string | null;

  @IsOptional()
  @IsString()
  workerName?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateContainerUnloadersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ContainerUnloaderDto)
  unloaders!: ContainerUnloaderDto[];

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class ListUnloadingWorkersQueryDto {
  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  includeInactive?: boolean = false;
}

export class CreateUnloadingWorkerDto {
  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  workerCode?: string | null;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdateUnloadingWorkerDto {
  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsString()
  workerCode?: string | null;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export interface UnloadingWageWorkerResponseDto {
  id: string;
  displayName: string;
  workerCode: string;
  isActive: boolean;
  phone: string | null;
  note: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  /** Compatibility fields for the old user-backed web selector. */
  email: string | null;
  roles: string[];
}

export interface UnloadingWageWorkerListResponseDto {
  items: UnloadingWageWorkerResponseDto[];
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

export class ListPayContainersQueryDto {
  @IsOptional()
  @IsIn(Object.values(PayContainerStatus))
  status?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  settlementMonth?: string;

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
    unloadingWorkerId: string | null;
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

export interface ContainerUnloadingWageResponseDto {
  containerId: string;
  containerNo: string;
  classification: string | null;
  trailerNumber: string | null;
  payContainerId: string | null;
  payContainerNo: string | null;
  status: string | null;
  currency: string | null;
  rateAmount: string | null;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  associatedContainers: Array<{
    id: string;
    containerId: string;
    containerNo: string;
  }>;
  unloaders: Array<{
    id: string;
    unloadingWorkerId: string | null;
    workerUserId: string | null;
    workerCode: string;
    workerName: string;
    note: string | null;
  }>;
}

export interface PayContainerListResponseDto {
  items: PayContainerResponseDto[];
  limit: number;
  offset: number;
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
    completedAt: string;
    rateAmount: string;
    allocationMethod: string;
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
