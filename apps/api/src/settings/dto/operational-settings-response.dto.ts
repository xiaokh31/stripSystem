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

export interface OperationalSettingsMutationResponseDto {
  settings: OperationalSettingsResponseDto;
  audit: {
    actorUserId: string;
    action: 'settings.update';
    changedKeys: string[];
  };
}
