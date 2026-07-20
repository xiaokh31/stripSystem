import { BadRequestException } from '@nestjs/common';

export const PARSER_LEARNING_CASE_STATES = [
  'OPEN',
  'MAPPING',
  'READY_FOR_REPLAY',
  'REPLAY_FAILED',
  'AWAITING_COMPLETION',
  'AWAITING_APPROVAL',
  'CLOSED',
] as const;

export type ParserLearningCaseState =
  (typeof PARSER_LEARNING_CASE_STATES)[number];

export interface ListParserLearningCasesQueryDto {
  status?: ParserLearningCaseState;
  limit: number;
  offset: number;
}

export interface SaveParserProfileDraftDto {
  expectedRevision: number;
  mappingDefinition: Record<string, unknown>;
  fingerprintDefinition: Record<string, unknown>;
}

export interface ParserProfileRevisionDto {
  revision: number;
}

export interface QueueParserProfileReplayDto extends ParserProfileRevisionDto {
  idempotencyKey: string;
}

export interface SubmitParserProfileCandidateDto extends ParserProfileRevisionDto {
  replayArtifactId: string;
  stableName: string;
  customerLabel?: string | null;
}

export function parseListParserLearningCasesQuery(
  value: unknown,
): ListParserLearningCasesQueryDto {
  const query = objectValue(value, ['status', 'limit', 'offset']);
  const status = optionalString(query.status);
  if (
    status &&
    !PARSER_LEARNING_CASE_STATES.includes(
      status as (typeof PARSER_LEARNING_CASE_STATES)[number],
    )
  ) {
    throw validationError(['status']);
  }
  return {
    status: status as ParserLearningCaseState | undefined,
    limit: boundedInteger(query.limit, 50, 1, 100, 'limit'),
    offset: boundedInteger(query.offset, 0, 0, 100_000, 'offset'),
  };
}

export function parseSaveParserProfileDraftDto(
  value: unknown,
): SaveParserProfileDraftDto {
  const body = objectValue(value, [
    'expectedRevision',
    'mappingDefinition',
    'fingerprintDefinition',
  ]);
  return {
    expectedRevision: requiredRevision(
      body.expectedRevision,
      'expectedRevision',
      true,
    ),
    mappingDefinition: requiredObject(
      body.mappingDefinition,
      'mappingDefinition',
    ),
    fingerprintDefinition: requiredObject(
      body.fingerprintDefinition,
      'fingerprintDefinition',
    ),
  };
}

export function parseParserProfileRevisionDto(
  value: unknown,
): ParserProfileRevisionDto {
  const body = objectValue(value, ['revision']);
  return { revision: requiredRevision(body.revision, 'revision') };
}

export function parseQueueParserProfileReplayDto(
  value: unknown,
): QueueParserProfileReplayDto {
  const body = objectValue(value, ['revision', 'idempotencyKey']);
  const idempotencyKey = requiredString(body.idempotencyKey, 'idempotencyKey');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(idempotencyKey)) {
    throw validationError(['idempotencyKey']);
  }
  return {
    revision: requiredRevision(body.revision, 'revision'),
    idempotencyKey,
  };
}

export function parseSubmitParserProfileCandidateDto(
  value: unknown,
): SubmitParserProfileCandidateDto {
  const body = objectValue(value, [
    'revision',
    'replayArtifactId',
    'stableName',
    'customerLabel',
  ]);
  const stableName = requiredString(body.stableName, 'stableName');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(stableName)) {
    throw validationError(['stableName']);
  }
  const customerLabel = optionalString(body.customerLabel);
  if (customerLabel && customerLabel.length > 128) {
    throw validationError(['customerLabel']);
  }
  return {
    revision: requiredRevision(body.revision, 'revision'),
    replayArtifactId: requiredString(body.replayArtifactId, 'replayArtifactId'),
    stableName,
    customerLabel: customerLabel ?? null,
  };
}

function objectValue(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(['body']);
  }
  const body = value as Record<string, unknown>;
  const unknownKeys = Object.keys(body).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw validationError(unknownKeys.sort());
  }
  return body;
}

function requiredObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError([field]);
  }
  return value as Record<string, unknown>;
}

function requiredRevision(
  value: unknown,
  field: string,
  allowZero = false,
): number {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(value) || Number(value) < minimum) {
    throw validationError([field]);
  }
  return Number(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
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
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw validationError([field]);
  }
  return parsed;
}

function validationError(fields: string[]): BadRequestException {
  const code = 'PARSER_PROFILE_REQUEST_VALIDATION_FAILED';
  return new BadRequestException({
    code,
    message: code,
    details: { fields },
  });
}
