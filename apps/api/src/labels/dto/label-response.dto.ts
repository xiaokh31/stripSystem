import { GeneratedFileResponseDto } from '../../reports/dto/generated-file-response.dto';

export interface PalletResponseDto {
  id: string;
  containerId: string;
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateLabelsResponseDto {
  generatedFile: GeneratedFileResponseDto;
  pallets: PalletResponseDto[];
  warnings: unknown[];
  errors: unknown[];
}

export interface PalletListResponseDto {
  items: PalletResponseDto[];
}

export interface ReprintAuditEventDto {
  id: string;
  palletRecordId: string;
  businessPalletId: string;
  userId: string;
  printedAt: string;
  reason: string;
  palletStatus: string;
  supervisorOverride: boolean;
}

export interface PalletReprintResponseDto {
  event: ReprintAuditEventDto;
  pallet: PalletResponseDto;
}

export interface ContainerLabelReprintResponseDto {
  containerId: string;
  eventCount: number;
  events: ReprintAuditEventDto[];
}
