import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateDestinationPallets,
  type DestinationPalletCalculationInput,
} from './pallet-calculation';
import type { PalletPolicySnapshotDto } from '../settings/dto/operational-settings-response.dto';

const DEFAULT_POLICY: PalletPolicySnapshotDto = {
  policyVersion: 'pallet-footprint-v1',
  settingsRevision: 'default-settings-revision',
  palletLengthM: '1.0',
  palletWidthM: '1.2',
  lowHeightM: '1.7',
  otherHeightM: '2.2',
  lowHeightCapacityCbm: '2.04',
  otherDestinationCapacityCbm: '2.64',
  yeg1ExtraPallets: 4,
  lowHeightDestinationCodes: ['YYC4', 'YYC6', 'YEG1', 'YEG2'],
  otherDestinationAliases: [
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
  ],
  destinationAliasVersion: 'destination-aliases-v1',
};

function calculate(
  input: Partial<DestinationPalletCalculationInput> & {
    destinationCode: string | null;
    volumeCbm: string;
  },
  policy: PalletPolicySnapshotDto = DEFAULT_POLICY,
) {
  return calculateDestinationPallets(
    {
      cartons: 10,
      packageType: 'CARTON',
      ...input,
    },
    policy,
  );
}

describe('calculateDestinationPallets', () => {
  it.each([
    ['YYC4', '2.04', 1, 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7', '2.04'],
    ['YYC4', '2.05', 2, 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7', '2.04'],
    ['YYC4', '4.08', 2, 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7', '2.04'],
    ['YYC4', '4.09', 3, 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7', '2.04'],
    ['YYC6', '2.04', 1, 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7', '2.04'],
    ['YEG2', '13.236', 7, 'FOOTPRINT_HEIGHT_VOLUME_LOW_1_7', '2.04'],
    ['YVR2', '2.64', 1, 'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2', '2.64'],
    ['YVR3', '2.65', 2, 'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2', '2.64'],
    ['YVR4', '5.29', 3, 'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2', '2.64'],
    ['UPS', '5.40', 3, 'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2', '2.64'],
    [
      'Private Address',
      '3.61',
      2,
      'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2',
      '2.64',
    ],
  ])(
    '%s at %s CBM calculates with the footprint capacity',
    (destinationCode, volumeCbm, pallets, ruleCode, capacityCbm) => {
      const result = calculate({ destinationCode, volumeCbm });

      expect(result).toMatchObject({
        calculatedPallets: pallets,
        finalPallets: pallets,
        palletRuleCode: ruleCode,
        calculationBasisCbm: capacityCbm,
      });
      expect(result.palletPolicySnapshot).toMatchObject({
        capacityCbm,
        ruleCode,
        ruleVersion: 'pallet-footprint-height-v2',
      });
    },
  );

  it.each([
    'PUROLATOR',
    'PURLATOR',
    'PURO',
    'P/A',
    'GOODCANG',
    'GOOD CANG',
    'Private Address / WB-1',
    'Commercial Address / WB-2',
    'Business Address / WB-3',
    '私人地址 / WB-4',
    '商業地址 / WB-5',
  ])('recognizes the OTHER destination alias %s', (destinationCode) => {
    const result = calculate({ destinationCode, volumeCbm: '2.64' });

    expect(result.destinationGroup).toBe('OTHER_DESTINATION_2_2');
    expect(result.warnings.map(({ code }) => code)).not.toContain(
      'NEED_CONFIRM_DESTINATION_TYPE',
    );
  });

  it.each(['NOTUPS', 'YEG10', 'PRIVATEER'])(
    'does not classify the loose substring %s as a known alias',
    (destinationCode) => {
      expect(
        calculate({ destinationCode, volumeCbm: '1' }).warnings.map(
          ({ code }) => code,
        ),
      ).toContain('NEED_CONFIRM_DESTINATION_TYPE');
    },
  );

  it('applies YEG1 +4 only to volume calculations', () => {
    expect(calculate({ destinationCode: 'YEG1', volumeCbm: '4.08' })).toMatchObject(
      { calculatedPallets: 6 },
    );
    const zeroVolume = calculate({
      cartons: 3,
      destinationCode: 'YEG1',
      volumeCbm: '0',
    });
    expect(zeroVolume.calculatedPallets).toBe(5);
    expect(zeroVolume.warnings.map(({ code }) => code)).toEqual([
      'ZERO_VOLUME_WITH_CARTONS',
    ]);
  });

  it('uses piece count for wooden crates and oversized carton pieces', () => {
    expect(
      calculate({
        cartons: 7,
        destinationCode: 'YVR2',
        packageType: 'WOODEN_CRATE',
        volumeCbm: '9',
      }),
    ).toMatchObject({
      calculatedPallets: 7,
      palletRuleCode: 'WOODEN_CRATE_PIECE_COUNT',
      effectivePackageType: 'WOODEN_CRATE',
    });

    expect(
      calculate({ cartons: 2, destinationCode: 'OTHER', volumeCbm: '5.60' }),
    ).toMatchObject({
      calculatedPallets: 2,
      palletRuleCode: 'OVERSIZE_PIECE_COUNT',
      effectivePackageType: 'CARTON',
    });
  });

  it('falls back to volume with stable warnings when piece counts are unavailable', () => {
    const oversize = calculate({
      cartons: 0,
      destinationCode: 'OTHER',
      volumeCbm: '5.60',
    });
    expect(oversize.calculatedPallets).toBe(3);
    expect(oversize.warnings.map(({ code }) => code)).toContain(
      'OVERSIZE_PIECE_COUNT_REQUIRED',
    );

    const wooden = calculate({
      cartons: 0,
      destinationCode: 'OTHER',
      packageType: 'WOODEN_CRATE',
      volumeCbm: '5.60',
    });
    expect(wooden.calculatedPallets).toBe(3);
    expect(wooden.warnings.map(({ code }) => code)).toContain(
      'WOODEN_CRATE_PIECE_COUNT_REQUIRED',
    );
  });

  it('keeps manual override final while preserving calculated metadata', () => {
    const result = calculate({
      destinationCode: 'YYC4',
      manualPallets: 4,
      volumeCbm: '2.04',
    });

    expect(result).toMatchObject({ calculatedPallets: 1, finalPallets: 4 });
    expect(result.palletPolicySnapshot).toMatchObject({
      calculatedPallets: 1,
      finalPallets: 4,
      manualPallets: 4,
    });
  });

  it('uses exact decimal arithmetic for a custom footprint', () => {
    const result = calculate(
      { destinationCode: 'YYC4', volumeCbm: '1.871' },
      {
        ...DEFAULT_POLICY,
        palletWidthM: '1.1',
        lowHeightCapacityCbm: '1.87',
        otherDestinationCapacityCbm: '2.42',
      },
    );

    expect(result).toMatchObject({
      calculatedPallets: 2,
      calculationBasisCbm: '1.87',
    });
  });

  it('uses OTHER capacity for unmatched/missing destinations without returning zero', () => {
    const unmatched = calculate({
      cartons: 1,
      destinationCode: 'Unlisted destination',
      volumeCbm: '1',
    });
    expect(unmatched.calculatedPallets).toBe(1);
    expect(unmatched.warnings.map(({ code }) => code)).toContain(
      'NEED_CONFIRM_DESTINATION_TYPE',
    );

    const missing = calculate({
      cartons: 1,
      destinationCode: null,
      volumeCbm: '1',
    });
    expect(missing.calculatedPallets).toBe(1);
    expect(missing.warnings.map(({ code }) => code)).toContain(
      'MISSING_DESTINATION',
    );
  });
});

describe('pallet calculation cross-language contract', () => {
  it('matches every shared fixture including the immutable snapshot', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../../samples/contracts/pallet-calculation-v2.json',
        ),
        'utf8',
      ),
    ) as {
      policy: PalletPolicySnapshotDto;
      cases: Array<{
        name: string;
        policyOverrides?: Partial<PalletPolicySnapshotDto>;
        input: DestinationPalletCalculationInput;
        expected: {
          ruleCode: string;
          capacityCbm: string;
          roundingMode: string;
          calculatedPallets: number;
          finalPallets: number;
          warningCodes: string[];
          policySnapshot: Record<string, unknown>;
        };
      }>;
    };

    for (const contractCase of fixture.cases) {
      const result = calculateDestinationPallets(contractCase.input, {
        ...fixture.policy,
        ...contractCase.policyOverrides,
      });
      expect({
        ruleCode: result.palletRuleCode,
        capacityCbm: result.palletPolicySnapshot.capacityCbm,
        roundingMode: result.roundingMode,
        calculatedPallets: result.calculatedPallets,
        finalPallets: result.finalPallets,
        warningCodes: result.warnings.map(({ code }) => code),
        policySnapshot: result.palletPolicySnapshot,
      }).toEqual(contractCase.expected);
    }
  });
});
