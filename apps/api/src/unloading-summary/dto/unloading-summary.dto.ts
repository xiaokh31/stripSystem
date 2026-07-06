import { Matches } from 'class-validator';
import { GeneratedFileResponseDto } from '../../reports/dto/generated-file-response.dto';

export class UnloadingSummaryMonthQueryDto {
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
}

export class ExportUnloadingSummaryDto {
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
}

export interface UnloadingSummaryGeneratedFileDto extends GeneratedFileResponseDto {
  downloadUrl: string;
}

export interface UnloadingSummaryRowDto {
  sequence: number;
  containerId: string;
  containerNo: string;
  status: string;
  payContainerId: string | null;
  payContainerNo: string | null;
  classification: string | null;
  businessTag: string;
  trailerNumber: string | null;
  completedAt: string;
  dateBusinessTag: string;
  destinationId: string | null;
  destinationText: string;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number;
  finalPallets: number;
  quantityText: string;
  referenceText: string | null;
  appointmentText: string | null;
  splitOrVarianceText: string | null;
  operationNote: string | null;
  rawJson: unknown;
}

export interface UnloadingSummaryReviewItemDto {
  code: string;
  message: string;
  containerId?: string | null;
  containerNo?: string | null;
  status?: string | null;
  payContainerId?: string | null;
  payContainerNo?: string | null;
  field?: string | null;
}

export interface UnloadingSummaryResponseDto {
  month: string;
  sourceContainerCount: number;
  rowCount: number;
  rows: UnloadingSummaryRowDto[];
  reviewItems: UnloadingSummaryReviewItemDto[];
  generatedFiles: UnloadingSummaryGeneratedFileDto[];
}

export interface ExportUnloadingSummaryResponseDto extends UnloadingSummaryResponseDto {
  generatedFile: UnloadingSummaryGeneratedFileDto;
  exportWarnings: unknown[];
  exportErrors: unknown[];
}

export interface UnloadingSummaryWorkerPayload {
  task_status?: string;
  summary_result?: {
    outputPath?: string;
    mimeType?: string;
    warnings?: unknown[];
    errors?: unknown[];
    rowCount?: number;
    sourceContainerCount?: number;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}
