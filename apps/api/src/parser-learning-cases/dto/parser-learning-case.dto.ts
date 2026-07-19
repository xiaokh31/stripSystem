import { BadRequestException } from '@nestjs/common';

export interface StartParserLearningCaseDto {
  importFileId: string;
}

export interface LinkParserLearningCaseContainerDto {
  containerId: string;
}

export interface CloseParserLearningCaseDto {
  reasonCode?: string;
}

export function parseStartParserLearningCaseDto(
  value: unknown,
): StartParserLearningCaseDto {
  const body = parserBody(value, ['importFileId']);
  if (typeof body.importFileId !== 'string' || !body.importFileId.trim()) {
    throw validationError(['importFileId']);
  }
  return { importFileId: body.importFileId.trim() };
}

export function parseLinkParserLearningCaseContainerDto(
  value: unknown,
): LinkParserLearningCaseContainerDto {
  const body = parserBody(value, ['containerId']);
  if (typeof body.containerId !== 'string' || !body.containerId.trim()) {
    throw validationError(['containerId']);
  }
  return { containerId: body.containerId.trim() };
}

export function parseCloseParserLearningCaseDto(
  value: unknown,
): CloseParserLearningCaseDto {
  const body = parserBody(value ?? {}, ['reasonCode']);
  if (body.reasonCode === undefined) {
    return {};
  }
  if (
    typeof body.reasonCode !== 'string' ||
    !/^[A-Z][A-Z0-9_]{1,63}$/.test(body.reasonCode)
  ) {
    throw validationError(['reasonCode']);
  }
  return { reasonCode: body.reasonCode };
}

function parserBody(
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

function validationError(fields: string[]): BadRequestException {
  const code = 'PARSER_LEARNING_VALIDATION_FAILED';
  return new BadRequestException({
    code,
    message: code,
    details: { fields },
  });
}

export interface ParserLearningCaseResponseDto {
  id: string;
  status: string;
  sourceImportId: string;
  sourceFileSha256: string;
  sourceImport: {
    id: string;
    originalFilename: string;
    format: string;
    parseStatus: string;
    rawMetadata: unknown;
  } | null;
  linkedContainer: {
    id: string;
    containerNo: string;
    sourceFormat: string;
    parserSourceKind: string;
    parserVersion: string | null;
    rawMetadata: unknown;
  } | null;
  draftDefinition: unknown;
  completionSnapshot: unknown;
  replaySummary: unknown;
  createdById: string;
  updatedById: string;
  closedById: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
