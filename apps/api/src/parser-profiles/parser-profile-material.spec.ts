import { classifyParserMaterialCorrection } from './parser-profile-material';

describe('parser-profile material correction classifier', () => {
  const staged = {
    containerNo: 'TEST1234567',
    sourceSelection: { sheet: 'Sheet1', headerRow: 2 },
    mappingDefinition: { destinationCode: 'Warehouse' },
    lines: [
      {
        rowNumber: 3,
        included: true,
        destinationCode: 'YEG1',
        cartons: 12,
        volumeCbm: '1.200',
        packageType: 'CARTON',
        waybillNo: 'WB-1',
        dockNo: 'D1',
        manualPallets: 4,
      },
    ],
  };

  it('classifies every product-defined parser field and row inclusion as material', () => {
    const proposed = structuredClone(staged);
    proposed.containerNo = 'TEST7654321';
    proposed.sourceSelection.sheet = 'Other';
    proposed.mappingDefinition.destinationCode = 'Destination';
    proposed.lines[0].included = false;
    proposed.lines[0].destinationCode = 'YYC4';
    proposed.lines[0].cartons = 13;
    proposed.lines[0].volumeCbm = '1.201';
    proposed.lines[0].packageType = 'WOODEN_CRATE';
    proposed.lines[0].waybillNo = 'WB-2';

    expect(
      classifyParserMaterialCorrection(staged, proposed).map(
        (item) => item.field,
      ),
    ).toEqual(
      expect.arrayContaining([
        'containerNo',
        'sourceSelection',
        'mappingDefinition',
        'included',
        'destinationCode',
        'cartons',
        'volumeCbm',
        'packageType',
        'waybillNo',
      ]),
    );
  });

  it('uses canonical three-decimal volume equality', () => {
    const proposed = structuredClone(staged);
    proposed.lines[0].volumeCbm = '1.2';
    expect(classifyParserMaterialCorrection(staged, proposed)).toEqual([]);
  });

  it('ignores dock, wage/status, physical pallet override, and report activity', () => {
    const proposed = structuredClone(staged) as typeof staged & {
      unloaders?: string[];
      status?: string;
      reportDownloadedAt?: string;
    };
    proposed.lines[0].dockNo = 'D9';
    proposed.lines[0].manualPallets = 99;
    proposed.unloaders = ['worker'];
    proposed.status = 'UNLOADED';
    proposed.reportDownloadedAt = '2026-07-20T00:00:00Z';
    expect(classifyParserMaterialCorrection(staged, proposed)).toEqual([]);
  });

  it('classifies add and remove row without trusting a client material flag', () => {
    const proposed = structuredClone(staged);
    proposed.lines = [
      {
        ...proposed.lines[0],
        rowNumber: 4,
      },
    ];
    expect(
      classifyParserMaterialCorrection(staged, proposed).map((item) => item.code),
    ).toEqual(['PARSER_MATERIAL_ROW_REMOVED', 'PARSER_MATERIAL_ROW_ADDED']);
  });

  it('does not call reference or package edits material when grouping and pallet outcomes stay equal', () => {
    const proposed = structuredClone(staged);
    proposed.lines[0].waybillNo = 'DISPLAY-ONLY';
    proposed.lines[0].packageType = 'WOODEN_CRATE';
    expect(
      classifyParserMaterialCorrection(staged, proposed, {
        groupingChanged: false,
        palletOutcomeChanged: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'waybillNo', material: false }),
        expect.objectContaining({ field: 'packageType', material: false }),
      ]),
    );
  });

  it('marks conditional fields material only with persisted grouping or pallet impact', () => {
    const proposed = structuredClone(staged);
    proposed.lines[0].waybillNo = 'GROUPING-INPUT';
    proposed.lines[0].packageType = 'WOODEN_CRATE';
    expect(
      classifyParserMaterialCorrection(staged, proposed, {
        groupingChanged: true,
        palletOutcomeChanged: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'waybillNo', material: true }),
        expect.objectContaining({ field: 'packageType', material: true }),
      ]),
    );
  });
});
