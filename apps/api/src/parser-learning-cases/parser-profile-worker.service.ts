import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PROFILE_WORKER_TIMEOUT_MS = 120_000;
const PROFILE_WORKER_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

export interface ParserProfileIssue {
  code: string;
  path?: string | null;
  row?: number | null;
  field?: string | null;
  rawValue?: unknown;
  params?: Record<string, unknown>;
}

export interface ParserProfileInspectionPayload {
  contractVersion: string;
  workerVersion: string;
  inspection: Record<string, unknown> | null;
  candidateMappings: Array<Record<string, unknown>>;
  issues: ParserProfileIssue[];
}

export interface ParserProfileValidationPayload {
  valid: boolean;
  mappingSchemaVersion: string;
  fingerprintVersion: string;
  workerVersion: string;
  issues: ParserProfileIssue[];
}

export interface ParserProfileExecutionPayload {
  workerVersion: string;
  result: ParserProfileParseResult | null;
  issues: ParserProfileIssue[];
}

export interface ParserProfileParseResult {
  containerNo: string | null;
  formatType: string;
  confidence: number;
  parserVersion: string;
  lines: Array<Record<string, unknown>>;
  destinationSummaries: Array<Record<string, unknown>>;
  warnings: ParserProfileIssue[];
  errors: ParserProfileIssue[];
  rawMetadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  [key: string]: unknown;
}

@Injectable()
export class ParserProfileWorkerService {
  private readonly workerPythonDir: string;

  constructor(configService: ConfigService) {
    this.workerPythonDir = configService.getOrThrow<string>(
      'app.workerPythonDir',
    );
  }

  inspectFile(inputFile: string): Promise<ParserProfileInspectionPayload> {
    return this.run<ParserProfileInspectionPayload>([
      'profile-inspect',
      '--input-file',
      inputFile,
    ]);
  }

  validateDefinition(
    mappingDefinition: Record<string, unknown>,
    fingerprintDefinition: Record<string, unknown>,
  ): Promise<ParserProfileValidationPayload> {
    return this.run<ParserProfileValidationPayload>([
      'profile-validate',
      '--mapping-definition-json',
      JSON.stringify(mappingDefinition),
      '--fingerprint-definition-json',
      JSON.stringify(fingerprintDefinition),
    ]);
  }

  executeMapping(
    inputFile: string,
    mappingDefinition: Record<string, unknown>,
    replayInputHash: string,
  ): Promise<ParserProfileExecutionPayload> {
    return this.run<ParserProfileExecutionPayload>([
      'profile-execute',
      '--input-file',
      inputFile,
      '--mapping-definition-json',
      JSON.stringify(mappingDefinition),
      '--replay-input-hash',
      replayInputHash,
    ]);
  }

  private async run<T>(args: string[]): Promise<T> {
    let stdout: string;
    try {
      const result = await execFileAsync(
        'uv',
        ['run', 'unloading-worker', ...args],
        {
          cwd: this.workerPythonDir,
          encoding: 'utf8',
          timeout: PROFILE_WORKER_TIMEOUT_MS,
          maxBuffer: PROFILE_WORKER_MAX_BUFFER_BYTES,
        },
      );
      stdout = result.stdout;
    } catch (error) {
      throw this.workerFailure('PROFILE_WORKER_INVOCATION_FAILED', error);
    }

    const output = stdout.trim();
    if (!output) {
      throw this.workerFailure('PROFILE_WORKER_EMPTY_OUTPUT');
    }
    try {
      return JSON.parse(output) as T;
    } catch (error) {
      throw this.workerFailure('PROFILE_WORKER_INVALID_OUTPUT', error);
    }
  }

  private workerFailure(
    code: string,
    error?: unknown,
  ): InternalServerErrorException {
    return new InternalServerErrorException({
      code,
      message: code,
      details: {
        errorName: error instanceof Error ? error.name : null,
      },
    });
  }
}
