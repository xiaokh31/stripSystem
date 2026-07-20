import { BadRequestException } from '@nestjs/common';

export interface ParserReviewDecisionDto {
  expectedRevision: number;
  reason: string | null;
}

export interface ParserReviewCorrectDto extends ParserReviewDecisionDto {
  reason: string;
  canonicalResult: {
    containerNo: string;
    lines: Array<Record<string, unknown>>;
  };
}

export function parseParserReviewDecisionDto(
  value: unknown,
): ParserReviewDecisionDto {
  const input = object(value);
  const expectedRevision = Number(input?.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    invalid('expectedRevision');
  }
  return {
    expectedRevision,
    reason: optionalString(input?.reason),
  };
}

export function parseParserReviewRejectDto(
  value: unknown,
): ParserReviewDecisionDto & { reason: string } {
  const parsed = parseParserReviewDecisionDto(value);
  if (!parsed.reason) invalid('reason');
  return { ...parsed, reason: parsed.reason };
}

export function parseParserReviewCorrectDto(
  value: unknown,
): ParserReviewCorrectDto {
  const parsed = parseParserReviewRejectDto(value);
  const input = object(value);
  const result = object(input?.canonicalResult);
  const containerNo = optionalString(result?.containerNo);
  if (!containerNo) invalid('canonicalResult.containerNo');
  if (!Array.isArray(result?.lines) || result.lines.length === 0 || result.lines.length > 10_000) {
    invalid('canonicalResult.lines');
  }
  const seen = new Set<number>();
  const lines = result.lines.map((candidate, index) => {
    const row = object(candidate);
    if (!row) invalid(`canonicalResult.lines.${index}`);
    const rowNumber = Number(row.rowNumber);
    if (!Number.isSafeInteger(rowNumber) || rowNumber <= 0 || seen.has(rowNumber)) {
      invalid(`canonicalResult.lines.${index}.rowNumber`);
    }
    seen.add(rowNumber);
    const cartons = nullableNonNegativeInteger(row.cartons);
    const volumeCbm = nullableNonNegativeDecimal(row.volumeCbm);
    return {
      rowNumber,
      included: row.included !== false,
      destinationCode: optionalString(row.destinationCode),
      cartons,
      volumeCbm,
      packageType: optionalString(row.packageType),
      deliveryMethod: optionalString(row.deliveryMethod),
      waybillNo: optionalString(row.waybillNo),
      referenceNo: optionalString(row.referenceNo),
      poNumber: optionalString(row.poNumber),
    };
  });
  return {
    ...parsed,
    canonicalResult: { containerNo, lines },
  };
}

function nullableNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) invalid('cartons');
  return number;
}

function nullableNonNegativeDecimal(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) invalid('volumeCbm');
  return number.toFixed(3);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invalid(field: string): never {
  throw new BadRequestException({
    code: 'PARSER_REVIEW_VALIDATION_FAILED',
    message: 'PARSER_REVIEW_VALIDATION_FAILED',
    details: { field },
  });
}
