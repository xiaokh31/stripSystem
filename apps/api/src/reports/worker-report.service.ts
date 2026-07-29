import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const WORKER_REPORT_TIMEOUT_MS = 120_000;
const WORKER_REPORT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export interface WorkerReportRequest {
  company: string;
  parsed_result: Record<string, unknown>;
  pallet_result: Record<string, unknown>;
}

export interface WorkerReportPayload {
  task_status?: string;
  report_result?: {
    outputPath?: string;
    manifestPath?: string;
    writtenDestinationCount?: number;
    totalDestinationCount?: number;
    orderedDestinationDigest?: string;
    warnings?: unknown[];
    errors?: unknown[];
    [key: string]: unknown;
  } | null;
  warnings?: unknown[];
  errors?: unknown[];
  exception?: Record<string, unknown> | null;
  [key: string]: unknown;
}

@Injectable()
export class WorkerReportService {
  private readonly workerPythonDir: string;
  private readonly reportTemplatePath: string;

  constructor(configService: ConfigService) {
    this.workerPythonDir = configService.getOrThrow<string>(
      'app.workerPythonDir',
    );
    this.reportTemplatePath = configService.getOrThrow<string>(
      'app.reportTemplatePath',
    );
  }

  async writeReport(
    request: WorkerReportRequest,
    outputDir: string,
  ): Promise<WorkerReportPayload> {
    const tempDir = await mkdtemp(join(tmpdir(), 'bestar-report-'));
    const payloadPath = join(tempDir, 'report-payload.json');

    try {
      await mkdir(outputDir, { recursive: true });
      await writeFile(payloadPath, JSON.stringify(request), 'utf8');
      const { stdout } = await execFileAsync(
        'uv',
        [
          'run',
          'unloading-worker',
          'write-report',
          '--payload',
          payloadPath,
          '--template',
          this.reportTemplatePath,
          '--output-dir',
          outputDir,
        ],
        {
          cwd: this.workerPythonDir,
          encoding: 'utf8',
          timeout: WORKER_REPORT_TIMEOUT_MS,
          maxBuffer: WORKER_REPORT_MAX_BUFFER_BYTES,
        },
      );

      return this.parseWorkerStdout(stdout);
    } catch (error) {
      const payload = this.parseWorkerErrorStdout(error);
      if (payload) {
        return payload;
      }

      throw new InternalServerErrorException({
        code: 'WORKER_REPORT_INVOCATION_FAILED',
        message: 'WORKER_REPORT_INVOCATION_FAILED',
        labelKey: 'reports.errors.workerInvocationFailed',
        details: { stage: 'invoke' },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private parseWorkerErrorStdout(error: unknown): WorkerReportPayload | null {
    if (!this.hasStdout(error)) {
      return null;
    }

    try {
      return this.parseWorkerStdout(error.stdout);
    } catch {
      return null;
    }
  }

  private parseWorkerStdout(stdout: string): WorkerReportPayload {
    const output = stdout.trim();
    if (!output) {
      throw new InternalServerErrorException({
        code: 'WORKER_REPORT_EMPTY_OUTPUT',
        message: 'WORKER_REPORT_EMPTY_OUTPUT',
        labelKey: 'reports.errors.workerEmptyOutput',
        details: { stage: 'parse-output' },
      });
    }

    try {
      return JSON.parse(output) as WorkerReportPayload;
    } catch {
      throw new InternalServerErrorException({
        code: 'WORKER_REPORT_INVALID_OUTPUT',
        message: 'WORKER_REPORT_INVALID_OUTPUT',
        labelKey: 'reports.errors.workerInvalidOutput',
        details: { stage: 'parse-output' },
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
    return 'Unknown worker report error';
  }
}
