import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const WORKER_ATTENDANCE_TIMEOUT_MS = 120_000;
const WORKER_ATTENDANCE_MAX_BUFFER_BYTES = 48 * 1024 * 1024;

export interface WorkerAttendanceIssue {
  code?: string;
  message?: string;
  rowNumber?: number | null;
  field?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  workDate?: string | null;
  [key: string]: unknown;
}

export interface WorkerAttendanceDay {
  employeeId?: string | null;
  employeeName?: string | null;
  department?: string | null;
  workDate?: string;
  dayNumber?: number;
  punchTimes?: string[];
  calculationMethod?:
    | 'NO_PUNCHES'
    | 'FIRST_LAST_FALLBACK'
    | 'PAIRED_INTERVALS';
  workIntervals?: WorkerAttendanceWorkInterval[];
  pairedGrossHours?: number | null;
  lunchHours?: number;
  calculatedHours?: number | null;
  firstPunch?: string | null;
  lastPunch?: string | null;
  rawCellValues?: string[];
  rowNumbers?: number[];
  warnings?: WorkerAttendanceIssue[];
  errors?: WorkerAttendanceIssue[];
  [key: string]: unknown;
}

export interface WorkerAttendanceWorkInterval {
  start: string;
  end: string;
  minutes: number;
  hours: number;
}

export interface WorkerAttendanceParsedResult {
  formatType?: string;
  parserVersion?: string;
  sourceSheet?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  confidence?: number;
  employees?: unknown[];
  days?: WorkerAttendanceDay[];
  rawRows?: unknown[];
  warnings?: WorkerAttendanceIssue[];
  errors?: WorkerAttendanceIssue[];
  assumptions?: string[];
  [key: string]: unknown;
}

export interface WorkerWagePayload {
  schema_version?: number;
  batch_version?: string;
  generated_at?: string;
  source_file?: string;
  original_filename?: string;
  sha256?: string;
  detection?: unknown;
  parsed_result?: WorkerAttendanceParsedResult | null;
  wage_record_result?: {
    outputPath?: string;
    errors?: WorkerAttendanceIssue[];
    warnings?: WorkerAttendanceIssue[];
    [key: string]: unknown;
  } | null;
  task_report?: {
    htmlPath?: string;
    warningCount?: number;
    errorCount?: number;
    [key: string]: unknown;
  } | null;
  task_status?: string;
  parsed_json_path?: string | null;
  wage_record_path?: string | null;
  task_report_path?: string | null;
  employee_count?: number;
  day_count?: number;
  warning_count?: number;
  error_count?: number;
  warnings?: WorkerAttendanceIssue[];
  errors?: WorkerAttendanceIssue[];
  exception?: Record<string, unknown> | null;
  [key: string]: unknown;
}

@Injectable()
export class WorkerAttendanceService {
  private readonly workerPythonDir: string;
  private readonly wageTemplatePath: string;

  constructor(configService: ConfigService) {
    this.workerPythonDir = configService.getOrThrow<string>(
      'app.workerPythonDir',
    );
    this.wageTemplatePath = configService.getOrThrow<string>(
      'app.wageTemplatePath',
    );
  }

  async parseAttendance(
    inputFile: string,
    outputDir: string,
  ): Promise<WorkerWagePayload> {
    return this.runWorker([
      'run',
      'unloading-worker',
      'wage-parse-file',
      '--attendance-file',
      inputFile,
      '--output-dir',
      outputDir,
    ]);
  }

  async generateWageRecord(
    inputFile: string,
    outputDir: string,
    normalizedAttendanceJson: string,
  ): Promise<WorkerWagePayload> {
    return this.runWorker([
      'run',
      'unloading-worker',
      'wage-generate-record',
      '--attendance-file',
      inputFile,
      '--wage-template',
      this.wageTemplatePath,
      '--output-dir',
      outputDir,
      '--normalized-attendance-json',
      normalizedAttendanceJson,
    ]);
  }

  private async runWorker(args: string[]): Promise<WorkerWagePayload> {
    try {
      const { stdout } = await execFileAsync('uv', args, {
        cwd: this.workerPythonDir,
        encoding: 'utf8',
        timeout: WORKER_ATTENDANCE_TIMEOUT_MS,
        maxBuffer: WORKER_ATTENDANCE_MAX_BUFFER_BYTES,
      });

      return this.parseWorkerStdout(stdout);
    } catch (error) {
      const payload = this.parseWorkerErrorStdout(error);
      if (payload) {
        return payload;
      }

      throw new InternalServerErrorException({
        code: 'WORKER_ATTENDANCE_INVOCATION_FAILED',
        message: 'The Python wage worker could not be executed.',
        details: {
          workerPythonDir: this.workerPythonDir,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private parseWorkerErrorStdout(error: unknown): WorkerWagePayload | null {
    if (!this.hasStdout(error)) {
      return null;
    }

    try {
      return this.parseWorkerStdout(error.stdout);
    } catch {
      return null;
    }
  }

  private parseWorkerStdout(stdout: string): WorkerWagePayload {
    const output = stdout.trim();
    if (!output) {
      throw new InternalServerErrorException({
        code: 'WORKER_ATTENDANCE_EMPTY_OUTPUT',
        message: 'The Python wage worker returned no JSON output.',
        details: { workerPythonDir: this.workerPythonDir },
      });
    }

    try {
      return JSON.parse(output) as WorkerWagePayload;
    } catch (error) {
      throw new InternalServerErrorException({
        code: 'WORKER_ATTENDANCE_INVALID_OUTPUT',
        message: 'The Python wage worker returned invalid JSON.',
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
    return 'Unknown wage worker error';
  }
}
