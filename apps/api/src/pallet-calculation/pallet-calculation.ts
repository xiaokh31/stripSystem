import type { PalletPolicySnapshotDto } from '../settings/dto/operational-settings-response.dto';

export const PALLET_RULE_VERSION = 'pallet-footprint-height-v2';

export type PalletPackageType = 'CARTON' | 'WOODEN_CRATE';
export type PalletCalculationMode =
  | 'VOLUME'
  | 'PIECE_COUNT'
  | 'OVERSIZE_PIECE_COUNT';

export interface PalletCalculationWarning {
  code: string;
  destinationCode: string | null;
  field?: string;
  message: string;
}

export interface DestinationPalletCalculationInput {
  destinationCode: string | null;
  packageType: PalletPackageType;
  cartons: number;
  volumeCbm: string;
  manualPallets?: number | null;
  pieceCountSource?: 'ACTUAL_CARTONS' | 'PARSER_NORMALIZED_CARTONS';
  sourceLineNumber?: number | null;
}

export interface DestinationPalletCalculationResult {
  calculatedPallets: number;
  calculationBasisCbm: string | null;
  calculationMode: PalletCalculationMode;
  destinationGroup:
    | 'LOW_HEIGHT_1_7'
    | 'YEG1_1_7_PLUS_4'
    | 'OTHER_DESTINATION_2_2';
  effectivePackageType: PalletPackageType;
  finalPallets: number;
  palletPolicySnapshot: Record<string, unknown>;
  palletRuleCode:
    | 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7'
    | 'YEG1_FOOTPRINT_HEIGHT_PLUS_4'
    | 'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2'
    | 'WOODEN_CRATE_PIECE_COUNT'
    | 'OVERSIZE_PIECE_COUNT';
  roundingMode: 'CEIL' | 'PIECE_COUNT';
  warnings: PalletCalculationWarning[];
}

interface DecimalValue {
  coefficient: bigint;
  scale: number;
}

interface DestinationClassification {
  capacity: DecimalValue;
  destinationGroup: DestinationPalletCalculationResult['destinationGroup'];
  extraPallets: number;
  heightM: string;
  needsConfirmation: boolean;
  ruleCode: DestinationPalletCalculationResult['palletRuleCode'];
}

const MIN_VOLUME = decimal('0.01');
const ALIAS_SEPARATOR = String.raw`[\s/|,;:()\[\]{}-]`;

export function calculateDestinationPallets(
  input: DestinationPalletCalculationInput,
  policy: PalletPolicySnapshotDto,
): DestinationPalletCalculationResult {
  const classification = classifyDestination(input.destinationCode, policy);
  const warnings: PalletCalculationWarning[] = [];
  const destinationCode = input.destinationCode;
  const normalizedDestination = normalizeText(destinationCode);

  if (!normalizedDestination) {
    warnings.push({
      code: 'MISSING_DESTINATION',
      destinationCode,
      message: 'Destination is required for pallet calculation.',
    });
  } else if (classification.needsConfirmation) {
    warnings.push({
      code: 'NEED_CONFIRM_DESTINATION_TYPE',
      destinationCode,
      message:
        'Destination type was not recognized; other-destination capacity was used and requires review.',
    });
  }

  const reliablePieceCount = reliableCount(input.cartons);
  const pieceCountSource = reliablePieceCount
    ? (input.pieceCountSource ?? 'ACTUAL_CARTONS')
    : null;
  let volume = decimal(input.volumeCbm);
  if (input.cartons > 0 && isZero(volume)) {
    warnings.push({
      code: 'ZERO_VOLUME_WITH_CARTONS',
      destinationCode,
      field: 'volume',
      message:
        'Volume is zero while pieces exist; 0.01 CBM was used for pallet calculation.',
    });
    volume = MIN_VOLUME;
  }

  let calculationMode: DestinationPalletCalculationResult['calculationMode'] =
    'VOLUME';
  let palletRuleCode = classification.ruleCode;
  if (input.packageType === 'WOODEN_CRATE') {
    if (reliablePieceCount !== null) {
      calculationMode = 'PIECE_COUNT';
      palletRuleCode = 'WOODEN_CRATE_PIECE_COUNT';
    } else {
      warnings.push({
        code: 'WOODEN_CRATE_PIECE_COUNT_REQUIRED',
        destinationCode,
        message:
          'A reliable wooden-crate piece count is required; volume calculation was retained.',
      });
    }
  } else if (
    reliablePieceCount !== null &&
    compare(volume, multiplyInteger(classification.capacity, reliablePieceCount)) >
      0
  ) {
    calculationMode = 'OVERSIZE_PIECE_COUNT';
    palletRuleCode = 'OVERSIZE_PIECE_COUNT';
  } else if (
    reliablePieceCount === null &&
    compare(volume, classification.capacity) > 0
  ) {
    warnings.push({
      code: 'OVERSIZE_PIECE_COUNT_REQUIRED',
      destinationCode,
      message:
        'A reliable piece count is required to confirm oversize cargo; volume calculation was retained.',
    });
  }

  const usesPieceCount = calculationMode !== 'VOLUME';
  const basePallets = usesPieceCount
    ? (reliablePieceCount ?? 0)
    : volumePallets(volume, input.cartons > 0, classification.capacity);
  const appliedExtraPallets =
    calculationMode === 'VOLUME' && basePallets > 0
      ? classification.extraPallets
      : 0;
  const calculatedPallets = basePallets + appliedExtraPallets;
  const manualPallets = validManualPallets(input.manualPallets);
  const finalPallets = manualPallets ?? calculatedPallets;
  const capacityCbm = formatDecimal(classification.capacity);
  const roundingMode = usesPieceCount ? 'PIECE_COUNT' : 'CEIL';
  const calculationBasisCbm = usesPieceCount ? null : capacityCbm;
  const warningCodes = warnings.map((warning) => warning.code);

  const bucket = {
    sourceLineNumbers:
      input.sourceLineNumber === null || input.sourceLineNumber === undefined
        ? []
        : [input.sourceLineNumber],
    totalCartons: input.cartons,
    totalVolumeCbm: formatDecimal(volume),
    reliablePieceCount,
    pieceCountSources: pieceCountSource ? [pieceCountSource] : [],
    capacityCbm,
    ruleCode: palletRuleCode,
    calculationMode,
    roundingMode,
    basePallets,
    extraPallets: appliedExtraPallets,
    calculatedPallets,
    warningCodes,
  };
  const palletPolicySnapshot = {
    policyVersion: policy.policyVersion,
    ruleVersion: PALLET_RULE_VERSION,
    settingsRevision: policy.settingsRevision,
    destinationAliasVersion: policy.destinationAliasVersion,
    palletLengthM: policy.palletLengthM,
    palletWidthM: policy.palletWidthM,
    destinationHeightM: classification.heightM,
    destinationGroup: classification.destinationGroup,
    capacityCbm,
    packageType: input.packageType,
    ruleCode: palletRuleCode,
    calculationMode,
    roundingMode,
    yeg1ExtraPallets: policy.yeg1ExtraPallets,
    appliedExtraPallets,
    calculatedPallets,
    manualPallets,
    finalPallets,
    warningCodes,
    calculationBuckets: [bucket],
  };

  return {
    calculatedPallets,
    calculationBasisCbm,
    calculationMode,
    destinationGroup: classification.destinationGroup,
    effectivePackageType: input.packageType,
    finalPallets,
    palletPolicySnapshot,
    palletRuleCode,
    roundingMode,
    warnings,
  };
}

function classifyDestination(
  destinationCode: string | null,
  policy: PalletPolicySnapshotDto,
): DestinationClassification {
  const normalized = normalizeText(destinationCode);
  const lowCapacity = capacity(
    policy.palletLengthM,
    policy.palletWidthM,
    policy.lowHeightM,
  );
  const otherCapacity = capacity(
    policy.palletLengthM,
    policy.palletWidthM,
    policy.otherHeightM,
  );

  if (containsAlias(normalized, 'YEG1')) {
    return {
      capacity: lowCapacity,
      destinationGroup: 'YEG1_1_7_PLUS_4',
      extraPallets: policy.yeg1ExtraPallets,
      heightM: policy.lowHeightM,
      needsConfirmation: false,
      ruleCode: 'YEG1_FOOTPRINT_HEIGHT_PLUS_4',
    };
  }

  const lowCodes = policy.lowHeightDestinationCodes.filter(
    (code) => normalizeText(code) !== 'YEG1',
  );
  if (lowCodes.some((code) => containsAlias(normalized, code))) {
    return {
      capacity: lowCapacity,
      destinationGroup: 'LOW_HEIGHT_1_7',
      extraPallets: 0,
      heightM: policy.lowHeightM,
      needsConfirmation: false,
      ruleCode: 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7',
    };
  }

  const matchesOther = policy.otherDestinationAliases.some((alias) =>
    containsAlias(normalized, alias),
  );
  return {
    capacity: otherCapacity,
    destinationGroup: 'OTHER_DESTINATION_2_2',
    extraPallets: 0,
    heightM: policy.otherHeightM,
    needsConfirmation: Boolean(normalized) && !matchesOther,
    ruleCode: 'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2',
  };
}

function containsAlias(normalized: string, alias: string): boolean {
  const normalizedAlias = normalizeText(alias);
  if (!normalized || !normalizedAlias) {
    return false;
  }
  const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:^|${ALIAS_SEPARATOR})${escaped}(?:$|${ALIAS_SEPARATOR})`,
  ).test(normalized);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function reliableCount(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function validManualPallets(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function volumePallets(
  volume: DecimalValue,
  hasPieces: boolean,
  capacityValue: DecimalValue,
): number {
  if (!hasPieces && isZero(volume)) {
    return 0;
  }
  const pallets = isZero(volume) ? 0 : ceilDivideDecimal(volume, capacityValue);
  return hasPieces ? Math.max(1, pallets) : pallets;
}

function capacity(length: string, width: string, height: string): DecimalValue {
  return multiply(multiply(decimal(length), decimal(width)), decimal(height));
}

function decimal(value: string): DecimalValue {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid non-negative decimal: ${value}`);
  }
  const fraction = match[2] ?? '';
  return normalizeDecimal({
    coefficient: BigInt(`${match[1]}${fraction}`),
    scale: fraction.length,
  });
}

function normalizeDecimal(value: DecimalValue): DecimalValue {
  let { coefficient, scale } = value;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function multiply(left: DecimalValue, right: DecimalValue): DecimalValue {
  return normalizeDecimal({
    coefficient: left.coefficient * right.coefficient,
    scale: left.scale + right.scale,
  });
}

function multiplyInteger(value: DecimalValue, multiplier: number): DecimalValue {
  return normalizeDecimal({
    coefficient: value.coefficient * BigInt(multiplier),
    scale: value.scale,
  });
}

function compare(left: DecimalValue, right: DecimalValue): number {
  const scale = Math.max(left.scale, right.scale);
  const leftScaled = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightScaled = right.coefficient * 10n ** BigInt(scale - right.scale);
  return leftScaled === rightScaled ? 0 : leftScaled > rightScaled ? 1 : -1;
}

function ceilDivideDecimal(
  numerator: DecimalValue,
  denominator: DecimalValue,
): number {
  if (denominator.coefficient <= 0n) {
    throw new Error('Pallet capacity must be greater than zero.');
  }
  const scaledNumerator =
    numerator.coefficient * 10n ** BigInt(denominator.scale);
  const scaledDenominator =
    denominator.coefficient * 10n ** BigInt(numerator.scale);
  const quotient =
    (scaledNumerator + scaledDenominator - 1n) / scaledDenominator;
  const value = Number(quotient);
  if (!Number.isSafeInteger(value)) {
    throw new Error('Calculated pallet count exceeds the supported range.');
  }
  return value;
}

function isZero(value: DecimalValue): boolean {
  return value.coefficient === 0n;
}

function formatDecimal(value: DecimalValue): string {
  if (value.scale === 0) {
    return value.coefficient.toString();
  }
  const digits = value.coefficient.toString().padStart(value.scale + 1, '0');
  const split = digits.length - value.scale;
  return `${digits.slice(0, split)}.${digits.slice(split)}`;
}
