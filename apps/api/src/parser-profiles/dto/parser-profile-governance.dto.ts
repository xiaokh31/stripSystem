import { BadRequestException } from '@nestjs/common';

export interface ListParserProfilesQueryDto {
  lifecycle?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED';
  limit: number;
  offset: number;
}

export interface ApproveParserProfileDto {
  expectedRevision: number;
  replayId: string;
  reason: string;
}

export interface GovernParserProfileDto {
  expectedRevision: number;
  reason: string;
}

export function parseListParserProfilesQuery(
  value: unknown,
): ListParserProfilesQueryDto {
  const body = objectValue(value, ['lifecycle', 'limit', 'offset']);
  const lifecycle = optionalString(body.lifecycle);
  if (
    lifecycle &&
    !['DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED'].includes(lifecycle)
  ) {
    throw validationError(['lifecycle']);
  }
  return {
    lifecycle: lifecycle as ListParserProfilesQueryDto['lifecycle'],
    limit: boundedInteger(body.limit, 50, 1, 100, 'limit'),
    offset: boundedInteger(body.offset, 0, 0, 100_000, 'offset'),
  };
}

export function parseApproveParserProfileDto(
  value: unknown,
): ApproveParserProfileDto {
  const body = objectValue(value, [
    'expectedRevision',
    'replayId',
    'reason',
  ]);
  return {
    expectedRevision: revision(body.expectedRevision),
    replayId: requiredString(body.replayId, 'replayId', 160),
    reason: requiredString(body.reason, 'reason', 500),
  };
}

export function parseGovernParserProfileDto(
  value: unknown,
): GovernParserProfileDto {
  const body = objectValue(value, ['expectedRevision', 'reason']);
  return {
    expectedRevision: revision(body.expectedRevision),
    reason: requiredString(body.reason, 'reason', 500),
  };
}

function objectValue(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(['body']);
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknown.length > 0) {
    throw validationError(unknown.sort());
  }
  return record;
}

function revision(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw validationError(['expectedRevision']);
  }
  return Number(value);
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw validationError([field]);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw validationError(['query']);
  }
  return value.trim();
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw validationError([field]);
  }
  return parsed;
}

function validationError(fields: string[]): BadRequestException {
  const code = 'PARSER_PROFILE_GOVERNANCE_VALIDATION_FAILED';
  return new BadRequestException({ code, message: code, details: { fields } });
}
