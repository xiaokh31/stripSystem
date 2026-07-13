export type OperationalSettingInputType =
  | 'number'
  | 'select'
  | 'text'
  | 'textarea';

export interface OperationalSettingOptionDto {
  label: string;
  value: string;
}

export interface OperationalSettingFieldDto {
  key: string;
  category: string;
  label: string;
  description: string;
  inputType: OperationalSettingInputType;
  value: string;
  defaultValue: string;
  editable: boolean;
  options?: OperationalSettingOptionDto[];
  min?: number;
  max?: number;
  updatedAt: string | null;
  updatedById: string | null;
}

export interface OperationalSettingsResponseDto {
  fields: OperationalSettingFieldDto[];
  updatedAt: string | null;
}

export interface PalletPolicySnapshotDto {
  policyVersion: string;
  settingsRevision: string;
  palletLengthM: string;
  palletWidthM: string;
  lowHeightM: string;
  otherHeightM: string;
  lowHeightCapacityCbm: string;
  otherDestinationCapacityCbm: string;
  yeg1ExtraPallets: number;
  lowHeightDestinationCodes: string[];
  otherDestinationAliases: string[];
  destinationAliasVersion: string;
}

export interface OperationalSettingsMutationResponseDto {
  settings: OperationalSettingsResponseDto;
  palletPolicy: PalletPolicySnapshotDto;
  audit: {
    actorUserId: string;
    action: 'settings.update';
    changedKeys: string[];
  };
}
