export interface ParserMaterialDiff {
  code: 'PARSER_MATERIAL_FIELD_CHANGED' | 'PARSER_MATERIAL_ROW_ADDED' | 'PARSER_MATERIAL_ROW_REMOVED';
  field: string;
  rowNumber: number | null;
  before: unknown;
  after: unknown;
  material: boolean;
}

export interface ParserMaterialImpact {
  groupingChanged: boolean;
  palletOutcomeChanged: boolean;
}

const ALWAYS_MATERIAL_ROW_FIELDS = [
  'included',
  'destinationCode',
  'cartons',
  'volumeCbm',
] as const;

const CONDITIONAL_ROW_FIELDS = [
  'packageType',
  'deliveryMethod',
  'waybillNo',
  'referenceNo',
  'poNumber',
] as const;

const MATERIAL_ROW_FIELDS = [
  ...ALWAYS_MATERIAL_ROW_FIELDS,
  ...CONDITIONAL_ROW_FIELDS,
] as const;

export function classifyParserMaterialCorrection(
  staged: unknown,
  proposed: unknown,
  impact: ParserMaterialImpact = {
    groupingChanged: true,
    palletOutcomeChanged: true,
  },
): ParserMaterialDiff[] {
  const before = object(staged);
  const after = object(proposed);
  const diff: ParserMaterialDiff[] = [];

  compareField(diff, 'containerNo', null, before?.containerNo, after?.containerNo);
  compareField(
    diff,
    'sourceSelection',
    null,
    before?.sourceSelection,
    after?.sourceSelection,
  );
  compareField(
    diff,
    'mappingDefinition',
    null,
    before?.mappingDefinition,
    after?.mappingDefinition,
  );

  const beforeRows = rows(before?.lines);
  const afterRows = rows(after?.lines);
  const rowNumbers = [...new Set([...beforeRows.keys(), ...afterRows.keys()])].sort(
    (left, right) => left - right,
  );
  for (const rowNumber of rowNumbers) {
    const beforeRow = beforeRows.get(rowNumber);
    const afterRow = afterRows.get(rowNumber);
    if (!beforeRow) {
      diff.push({
        code: 'PARSER_MATERIAL_ROW_ADDED',
        field: 'lines',
        rowNumber,
        before: null,
        after: materialRow(afterRow),
        material: true,
      });
      continue;
    }
    if (!afterRow) {
      diff.push({
        code: 'PARSER_MATERIAL_ROW_REMOVED',
        field: 'lines',
        rowNumber,
        before: materialRow(beforeRow),
        after: null,
        material: true,
      });
      continue;
    }
    for (const field of ALWAYS_MATERIAL_ROW_FIELDS) {
      compareField(
        diff,
        field,
        rowNumber,
        materialValue(field, beforeRow[field]),
        materialValue(field, afterRow[field]),
      );
    }
    for (const field of CONDITIONAL_ROW_FIELDS) {
      compareField(
        diff,
        field,
        rowNumber,
        materialValue(field, beforeRow[field]),
        materialValue(field, afterRow[field]),
        conditionallyMaterial(field, impact),
      );
    }
  }
  return diff;
}

function conditionallyMaterial(
  field: (typeof CONDITIONAL_ROW_FIELDS)[number],
  impact: ParserMaterialImpact,
): boolean {
  if (field === 'packageType') return impact.palletOutcomeChanged;
  return impact.groupingChanged;
}

function compareField(
  diff: ParserMaterialDiff[],
  field: string,
  rowNumber: number | null,
  before: unknown,
  after: unknown,
  material = true,
): void {
  if (stable(before) === stable(after)) return;
  diff.push({
    code: 'PARSER_MATERIAL_FIELD_CHANGED',
    field,
    rowNumber,
    before: before ?? null,
    after: after ?? null,
    material,
  });
}

function rows(value: unknown): Map<number, Record<string, unknown>> {
  if (!Array.isArray(value)) return new Map();
  return new Map(
    value.flatMap((candidate, index) => {
      const row = object(candidate);
      if (!row) return [];
      const rowNumber = Number(row.rowNumber ?? index + 1);
      return Number.isSafeInteger(rowNumber) && rowNumber > 0
        ? [[rowNumber, row] as const]
        : [];
    }),
  );
}

function materialRow(row: Record<string, unknown> | undefined): unknown {
  if (!row) return null;
  return Object.fromEntries(
    MATERIAL_ROW_FIELDS.map((field) => [field, materialValue(field, row[field])]),
  );
}

function materialValue(field: string, value: unknown): unknown {
  if (field === 'volumeCbm') return decimal3(value);
  if (field === 'cartons') {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  }
  if (field === 'included') return value !== false;
  return typeof value === 'string' ? value.trim() || null : value ?? null;
}

function decimal3(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number.toFixed(3) : null;
}

function stable(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return candidate ?? null;
  };
  return JSON.stringify(normalize(value));
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
