import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const WORKER_PARSE_TIMEOUT_MS = 120_000;
const WORKER_PARSE_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

export interface WorkerIssue {
  code?: string;
  message?: string;
  row_number?: number | null;
  field?: string | null;
  destinationCode?: string | null;
  [key: string]: unknown;
}

export interface WorkerParsedLine {
  rowNumber?: number;
  destinationCode?: string | null;
  packageType?: string | null;
  deliveryMethod?: string | null;
  cartons?: number | null;
  totalCartons?: number | null;
  volumeCbm?: number | null;
  raw_json?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkerDestinationSummary {
  destinationCode?: string | null;
  packageType?: string | null;
  status?: string | null;
  totalCartons?: number | null;
  totalVolumeCbm?: number | null;
  totalSkidCount?: number | null;
  lineCount?: number | null;
  [key: string]: unknown;
}

export interface WorkerParsedResult {
  containerNo?: string | null;
  formatType?: string;
  parserVersion?: string;
  lines?: WorkerParsedLine[];
  destinationSummaries?: WorkerDestinationSummary[];
  warnings?: WorkerIssue[];
  errors?: WorkerIssue[];
  rawMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkerPalletPlan {
  destinationCode?: string | null;
  destinationType?: string | null;
  packageType?: string | null;
  ruleCode?: string | null;
  volumeDivisorCbm?: number | null;
  calculationBasisCbm?: number | null;
  roundingMode?: string | null;
  totalCartons?: number | null;
  totalVolumeCbm?: number | null;
  calculatedPallets?: number | null;
  manualPallets?: number | null;
  finalPallets?: number | null;
  warnings?: WorkerIssue[];
  [key: string]: unknown;
}

export interface WorkerPalletResult {
  plans?: WorkerPalletPlan[];
  warnings?: WorkerIssue[];
  errors?: WorkerIssue[];
  [key: string]: unknown;
}

export interface WorkerParsePayload {
  schema_version?: number;
  batch_version?: string;
  generated_at?: string;
  source_file?: string;
  original_filename?: string;
  sha256?: string | null;
  parse_scope?: string;
  detection?: Record<string, unknown> | null;
  parsed_result?: WorkerParsedResult | null;
  pallet_result?: WorkerPalletResult | null;
  report_result?: null;
  label_result?: null;
  task_status?: string;
  warnings?: WorkerIssue[];
  errors?: WorkerIssue[];
  exception?: Record<string, unknown> | null;
  [key: string]: unknown;
}

@Injectable()
export class WorkerParserService {
  private readonly workerPythonDir: string;

  constructor(configService: ConfigService) {
    this.workerPythonDir = configService.getOrThrow<string>(
      'app.workerPythonDir',
    );
  }

  async parseFile(inputFile: string): Promise<WorkerParsePayload> {
    try {
      const { stdout } = await execFileAsync(
        'uv',
        ['run', 'unloading-worker', 'parse-file', '--input-file', inputFile],
        {
          cwd: this.workerPythonDir,
          encoding: 'utf8',
          timeout: WORKER_PARSE_TIMEOUT_MS,
          maxBuffer: WORKER_PARSE_MAX_BUFFER_BYTES,
        },
      );

      return this.parseWorkerStdout(stdout);
    } catch (error) {
      const payload = this.parseWorkerErrorStdout(error);
      if (payload) {
        return payload;
      }

      throw new InternalServerErrorException({
        code: 'WORKER_PARSE_INVOCATION_FAILED',
        message: 'The Python worker parser could not be executed.',
        details: {
          workerPythonDir: this.workerPythonDir,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private parseWorkerErrorStdout(error: unknown): WorkerParsePayload | null {
    if (!this.hasStdout(error)) {
      return null;
    }

    try {
      return this.parseWorkerStdout(error.stdout);
    } catch {
      return null;
    }
  }

  private parseWorkerStdout(stdout: string): WorkerParsePayload {
    const output = stdout.trim();
    if (!output) {
      throw new InternalServerErrorException({
        code: 'WORKER_PARSE_EMPTY_OUTPUT',
        message: 'The Python worker parser returned no JSON output.',
        details: { workerPythonDir: this.workerPythonDir },
      });
    }

    try {
      return JSON.parse(output) as WorkerParsePayload;
    } catch (error) {
      throw new InternalServerErrorException({
        code: 'WORKER_PARSE_INVALID_OUTPUT',
        message: 'The Python worker parser returned invalid JSON.',
        details: {
          workerPythonDir: this.workerPythonDir,
          errorMessage: this.errorMessage(error),
          stdout: output.slice(0, 4000),
        },
      });
    }
  }

  private hasStdout(error: unknown): error is { stdout: string } {
    return (
      error !== null &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string'
    );
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown worker parser error';
  }
}
