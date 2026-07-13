import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { PalletPolicySnapshotDto } from './dto/operational-settings-response.dto';

export const PALLET_POLICY_VERSION = 'pallet-footprint-v1';
export const PALLET_DIMENSION_KEYS = ['palletLengthM', 'palletWidthM'] as const;

const DEFAULT_DIMENSIONS = {
  palletLengthM: '1.0',
  palletWidthM: '1.2',
} as const;

const LOW_HEIGHT_DESTINATION_CODES = ['YYC4', 'YYC6', 'YEG1', 'YEG2'];
const OTHER_DESTINATION_ALIASES = [
  'YVR2',
  'YVR3',
  'YVR4',
  'UPS',
  'PUROLATOR',
  'PURLATOR',
  'PURO',
  'P/A',
  'GOODCANG',
  'GOOD CANG',
  'PRIVATE',
  'PRIVATE ADDRESS',
  'COMMERCIAL',
  'COMMERCIAL ADDRESS',
  'BUSINESS',
  'BUSINESS ADDRESS',
  '私人',
  '私人地址',
  '商业',
  '商业地址',
  '商業',
  '商業地址',
];

/**
 * Resolves the only editable portion of the pallet policy.  Consumers receive
 * this plain-data snapshot and never read operational_settings themselves.
 */
@Injectable()
export class PalletPolicyResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(): Promise<PalletPolicySnapshotDto> {
    const records = await this.prisma.operationalSetting.findMany({
      where: { key: { in: [...PALLET_DIMENSION_KEYS] } },
      select: { key: true, value: true, updatedAt: true },
    });
    const byKey = new Map(records.map((record) => [record.key, record]));
    const palletLengthM =
      byKey.get('palletLengthM')?.value ?? DEFAULT_DIMENSIONS.palletLengthM;
    const palletWidthM =
      byKey.get('palletWidthM')?.value ?? DEFAULT_DIMENSIONS.palletWidthM;
    const lowHeightM = '1.7';
    const otherHeightM = '2.2';
    const revisionInput = JSON.stringify({
      policyVersion: PALLET_POLICY_VERSION,
      palletLengthM,
      palletWidthM,
      updatedAt: [...byKey.values()]
        .map((record) => record.updatedAt.toISOString())
        .sort(),
    });
    const settingsRevision = createHash('sha256')
      .update(revisionInput)
      .digest('hex');

    return {
      policyVersion: PALLET_POLICY_VERSION,
      settingsRevision,
      palletLengthM,
      palletWidthM,
      lowHeightM,
      otherHeightM,
      lowHeightCapacityCbm: capacityCbm(
        palletLengthM,
        palletWidthM,
        lowHeightM,
      ),
      otherDestinationCapacityCbm: capacityCbm(
        palletLengthM,
        palletWidthM,
        otherHeightM,
      ),
      yeg1ExtraPallets: 4,
      lowHeightDestinationCodes: LOW_HEIGHT_DESTINATION_CODES,
      otherDestinationAliases: [...OTHER_DESTINATION_ALIASES],
      destinationAliasVersion: 'destination-aliases-v1',
    };
  }
}

/** Decimal-only multiplication; no binary floating-point values enter policy capacity. */
function capacityCbm(length: string, width: string, height: string): string {
  const product =
    decimalToScaled(length) * decimalToScaled(width) * decimalToScaled(height);
  return formatScaled(product, 9);
}

function decimalToScaled(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3));
}

function formatScaled(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  const whole = value / divisor;
  const fraction = (value % divisor)
    .toString()
    .padStart(scale, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
