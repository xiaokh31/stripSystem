import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  OperationalSettingFieldDto,
  OperationalSettingInputType,
  OperationalSettingsMutationResponseDto,
  OperationalSettingsResponseDto,
  PalletPolicySnapshotDto,
} from './dto/operational-settings-response.dto';
import { PalletPolicyResolver } from './pallet-policy.resolver';
import { UpdateOperationalSettingsDto } from './dto/update-operational-settings.dto';

interface SettingDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
  inputType: OperationalSettingInputType;
  defaultValue: string;
  editable: boolean;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
}

interface OperationalSettingRecord {
  key: string;
  value: string;
  updatedById: string | null;
  updatedAt: Date | string;
}

export const OPERATIONAL_SETTING_DEFINITIONS: SettingDefinition[] = [
  setting(
    'palletLengthM',
    'Pallet calculation',
    'Pallet length m',
    'Pallet footprint length in meters used by the pallet policy.',
    'number',
    '1.0',
    { min: 0.1, max: 3 },
  ),
  setting(
    'palletWidthM',
    'Pallet calculation',
    'Pallet width m',
    'Pallet footprint width in meters used by the pallet policy.',
    'number',
    '1.2',
    { min: 0.1, max: 3 },
  ),
  setting(
    'siteName',
    'Operational profile',
    'Site name',
    'Name shown to office and warehouse users.',
    'text',
    'Bestar Warehouse Office',
  ),
  setting(
    'deliveryPhase',
    'Operational profile',
    'Delivery phase',
    'Current rollout stage shown on the dashboard.',
    'select',
    'P5 Pilot Ready',
    {
      options: [
        { label: 'P2 Office', value: 'P2 Office' },
        { label: 'P5 Pilot Ready', value: 'P5 Pilot Ready' },
        { label: 'Pilot Running', value: 'Pilot Running' },
        { label: 'Production', value: 'Production' },
      ],
    },
  ),
  setting(
    'operationalTimeZone',
    'Operational profile',
    'Operational time zone',
    'IANA time zone used for local warehouse timestamps.',
    'select',
    'America/Edmonton',
    {
      options: [
        { label: 'Calgary / Edmonton', value: 'America/Edmonton' },
        { label: 'Vancouver', value: 'America/Vancouver' },
        { label: 'Toronto', value: 'America/Toronto' },
        { label: 'UTC', value: 'UTC' },
      ],
    },
  ),
  setting(
    'duplicateImportPolicy',
    'Warehouse rules',
    'Duplicate import policy',
    'Policy for uploaded Excel files with the same SHA-256.',
    'select',
    'block',
    {
      options: [
        { label: 'Block duplicate uploads', value: 'block' },
        { label: 'Warn and keep existing import', value: 'warn' },
      ],
    },
  ),
  setting(
    'manualCorrectionPolicy',
    'Warehouse rules',
    'Manual correction policy',
    'How office corrections are tracked after parser output.',
    'select',
    'audit_required',
    {
      options: [
        { label: 'Audit required', value: 'audit_required' },
        { label: 'Admin approval required', value: 'admin_approval' },
      ],
    },
  ),
  setting(
    'unloadingWageOceanContainerRateCad',
    'Warehouse rules',
    'Ocean container unloading wage CAD',
    'Default unloading wage rate for one ocean pay container.',
    'number',
    '300',
    { min: 0, max: 10000 },
  ),
  setting(
    'unloadingWageUsToCanadaTransferRateCad',
    'Warehouse rules',
    'US-to-Canada transfer unloading wage CAD',
    'Default unloading wage rate for one trailer-group pay container.',
    'number',
    '360',
    { min: 0, max: 10000 },
  ),
  setting(
    'inventorySource',
    'Warehouse rules',
    'Inventory source',
    'Authoritative source for remaining pallet inventory.',
    'select',
    'backend_state',
    {
      options: [{ label: 'Backend/database state', value: 'backend_state' }],
    },
  ),
  setting(
    'reportTemplateName',
    'Generated files',
    'Report template',
    'Company unloading report template name.',
    'text',
    'Company Excel template',
  ),
  setting(
    'labelWidthMm',
    'Generated files',
    'Label width mm',
    'Physical PDF label width in millimeters.',
    'number',
    '150',
    { editable: false },
  ),
  setting(
    'labelHeightMm',
    'Generated files',
    'Label height mm',
    'Physical PDF label height in millimeters.',
    'number',
    '100',
    { editable: false },
  ),
  setting(
    'qrTargetSizeMm',
    'Generated files',
    'QR target size mm',
    'Target QR print box size in millimeters.',
    'number',
    '25',
    { min: 20, max: 40 },
  ),
  setting(
    'runtimeMode',
    'Deployment',
    'Runtime mode',
    'Expected local and production runtime mode.',
    'select',
    'docker_compose',
    {
      options: [
        { label: 'Docker Compose full stack', value: 'docker_compose' },
      ],
    },
  ),
  setting(
    'backupPolicy',
    'Deployment',
    'Backup policy',
    'PostgreSQL backup expectation for production operations.',
    'textarea',
    'Daily PostgreSQL backup before schema migrations.',
  ),
  setting(
    'storagePolicy',
    'Deployment',
    'Storage policy',
    'Persistence expectation for uploads, reports, and labels.',
    'textarea',
    'Persistent upload, report, and label file storage.',
  ),
];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly palletPolicyResolver: PalletPolicyResolver,
  ) {}

  async getOperationalSettings(): Promise<OperationalSettingsResponseDto> {
    const records = (await this.prisma.operationalSetting.findMany({
      where: {
        key: { in: OPERATIONAL_SETTING_DEFINITIONS.map((item) => item.key) },
      },
    })) as OperationalSettingRecord[];

    return this.toResponse(records);
  }

  async getPalletPolicy(): Promise<PalletPolicySnapshotDto> {
    return this.palletPolicyResolver.resolve();
  }

  async updateOperationalSettings(
    dto: UpdateOperationalSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<OperationalSettingsMutationResponseDto> {
    const values = dto.values ?? {};
    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new BadRequestException({
        code: 'SETTINGS_UPDATE_REQUIRED',
        message: 'At least one setting value must be provided.',
        details: {},
      });
    }

    const definitions = new Map(
      OPERATIONAL_SETTING_DEFINITIONS.map((definition) => [
        definition.key,
        definition,
      ]),
    );
    const validatedEntries = entries.map(([key, rawValue]) => {
      const definition = definitions.get(key);
      if (!definition) {
        throw new BadRequestException({
          code: 'UNKNOWN_SETTING_KEY',
          message: `Setting ${key} is not supported.`,
          details: { key },
        });
      }
      if (!definition.editable) {
        throw new BadRequestException({
          code: 'SETTING_NOT_EDITABLE',
          message: `Setting ${key} is not editable.`,
          details: { key },
        });
      }

      const value = this.validateValue(definition, rawValue);
      return { key, value };
    });
    const changedKeys = validatedEntries.map(({ key }) => key);

    await this.prisma.$transaction(
      validatedEntries.map(({ key, value }) => {
        return this.prisma.operationalSetting.upsert({
          where: { key },
          update: {
            value,
            updatedById: actor.id,
          },
          create: {
            key,
            value,
            updatedById: actor.id,
          },
        });
      }),
    );

    const [settings, palletPolicy] = await Promise.all([
      this.getOperationalSettings(),
      this.getPalletPolicy(),
    ]);

    return {
      settings,
      palletPolicy,
      audit: {
        actorUserId: actor.id,
        action: 'settings.update',
        changedKeys,
      },
    };
  }

  private toResponse(
    records: OperationalSettingRecord[],
  ): OperationalSettingsResponseDto {
    const recordsByKey = new Map(records.map((record) => [record.key, record]));
    const fields = OPERATIONAL_SETTING_DEFINITIONS.map((definition) => {
      const record = recordsByKey.get(definition.key);
      return this.toField(definition, record);
    });
    const updatedAt =
      fields
        .map((field) => field.updatedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    return { fields, updatedAt };
  }

  private toField(
    definition: SettingDefinition,
    record?: OperationalSettingRecord,
  ): OperationalSettingFieldDto {
    const editableRecord = definition.editable ? record : undefined;
    return {
      key: definition.key,
      category: definition.category,
      label: definition.label,
      description: definition.description,
      inputType: definition.inputType,
      value: editableRecord?.value ?? definition.defaultValue,
      defaultValue: definition.defaultValue,
      editable: definition.editable,
      options: definition.options,
      min: definition.min,
      max: definition.max,
      updatedAt: editableRecord
        ? new Date(editableRecord.updatedAt).toISOString()
        : null,
      updatedById: editableRecord?.updatedById ?? null,
    };
  }

  private validateValue(
    definition: SettingDefinition,
    rawValue: unknown,
  ): string {
    const isPalletDimension =
      definition.key === 'palletLengthM' || definition.key === 'palletWidthM';
    if (typeof rawValue !== 'string') {
      if (isPalletDimension) {
        throw this.palletDimensionError(definition.key, rawValue);
      }
      throw new BadRequestException({
        code: 'SETTING_VALUE_INVALID',
        message: `Setting ${definition.key} must be a string value.`,
        details: { key: definition.key },
      });
    }

    const value = rawValue.trim();
    if (value.length === 0) {
      if (isPalletDimension) {
        throw this.palletDimensionError(definition.key, value);
      }
      throw new BadRequestException({
        code: 'SETTING_VALUE_REQUIRED',
        message: `Setting ${definition.key} cannot be blank.`,
        details: { key: definition.key },
      });
    }

    if (definition.inputType === 'number') {
      if (isPalletDimension) {
        return this.validatePalletDimension(definition, value);
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new BadRequestException({
          code: 'SETTING_VALUE_INVALID',
          message: `Setting ${definition.key} must be a number.`,
          details: { key: definition.key, value },
        });
      }
      if (definition.min !== undefined && numeric < definition.min) {
        throw new BadRequestException({
          code: 'SETTING_VALUE_TOO_SMALL',
          message: `Setting ${definition.key} must be at least ${definition.min}.`,
          details: { key: definition.key, min: definition.min },
        });
      }
      if (definition.max !== undefined && numeric > definition.max) {
        throw new BadRequestException({
          code: 'SETTING_VALUE_TOO_LARGE',
          message: `Setting ${definition.key} must be at most ${definition.max}.`,
          details: { key: definition.key, max: definition.max },
        });
      }
    }

    if (
      definition.inputType === 'select' &&
      !definition.options?.some((option) => option.value === value)
    ) {
      throw new BadRequestException({
        code: 'SETTING_VALUE_UNSUPPORTED',
        message: `Setting ${definition.key} does not support value ${value}.`,
        details: { key: definition.key, value },
      });
    }

    return value;
  }

  private validatePalletDimension(
    definition: SettingDefinition,
    value: string,
  ): string {
    if (!/^\d+(?:\.\d{1,3})?$/.test(value)) {
      throw this.palletDimensionError(definition.key, value);
    }
    const [whole, fraction = ''] = value.split('.');
    const scaled =
      BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3));
    const min = BigInt(Math.round((definition.min ?? 0) * 1000));
    const max = BigInt(Math.round((definition.max ?? 0) * 1000));
    if (scaled === 0n || scaled < min || scaled > max) {
      throw this.palletDimensionError(definition.key, value);
    }
    const normalizedFraction = fraction.replace(/0+$/, '');
    return normalizedFraction ? `${whole}.${normalizedFraction}` : `${whole}.0`;
  }

  private palletDimensionError(
    key: string,
    value: unknown,
  ): BadRequestException {
    return new BadRequestException({
      code: 'PALLET_DIMENSION_INVALID',
      message:
        'Pallet dimensions must be positive decimal meter values within the supported physical range.',
      details: { key, min: 0.1, max: 3, value },
    });
  }
}

function setting(
  key: string,
  category: string,
  label: string,
  description: string,
  inputType: OperationalSettingInputType,
  defaultValue: string,
  options: Partial<
    Pick<SettingDefinition, 'editable' | 'max' | 'min' | 'options'>
  > = {},
): SettingDefinition {
  return {
    key,
    category,
    label,
    description,
    inputType,
    defaultValue,
    editable: true,
    ...options,
  };
}
