import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const WORKER_LABEL_TIMEOUT_MS = 120_000;
const WORKER_LABEL_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export interface WorkerLabelRequest {
  parsed_result: Record<string, unknown>;
  pallet_result: Record<string, unknown>;
}

export interface WorkerLabelPayload {
  task_status?: string;
  label_result?: {
    outputPath?: string;
    manifestPath?: string;
    labelCount?: number;
    palletIds?: unknown[];
    qrPayloads?: unknown[];
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
export class WorkerLabelService {
  private readonly workerPythonDir: string;

  constructor(configService: ConfigService) {
    this.workerPythonDir = configService.getOrThrow<string>(
      'app.workerPythonDir',
    );
  }

  async writeLabels(
    request: WorkerLabelRequest,
    outputDir: string,
    labelDate: string,
  ): Promise<WorkerLabelPayload> {
    const tempDir = await mkdtemp(join(tmpdir(), 'bestar-labels-'));
    const payloadPath = join(tempDir, 'label-payload.json');

    try {
      await mkdir(outputDir, { recursive: true });
      await writeFile(payloadPath, JSON.stringify(request), 'utf8');
      const { stdout } = await execFileAsync(
        'uv',
        [
          'run',
          'unloading-worker',
          'write-labels',
          '--payload',
          payloadPath,
          '--output-dir',
          outputDir,
          '--label-date',
          labelDate,
        ],
        {
          cwd: this.workerPythonDir,
          encoding: 'utf8',
          timeout: WORKER_LABEL_TIMEOUT_MS,
          maxBuffer: WORKER_LABEL_MAX_BUFFER_BYTES,
        },
      );

      return this.parseWorkerStdout(stdout);
    } catch (error) {
      const payload = this.parseWorkerErrorStdout(error);
      if (payload) {
        return payload;
      }

      throw new InternalServerErrorException({
        code: 'WORKER_LABEL_INVOCATION_FAILED',
        message: 'The Python worker label generator could not be executed.',
        details: {
          workerPythonDir: this.workerPythonDir,
          errorMessage: this.errorMessage(error),
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private parseWorkerErrorStdout(error: unknown): WorkerLabelPayload | null {
    if (!this.hasStdout(error)) {
      return null;
    }

    try {
      return this.parseWorkerStdout(error.stdout);
    } catch {
      return null;
    }
  }

  private parseWorkerStdout(stdout: string): WorkerLabelPayload {
    const output = stdout.trim();
    if (!output) {
      throw new InternalServerErrorException({
        code: 'WORKER_LABEL_EMPTY_OUTPUT',
        message: 'The Python worker label generator returned no JSON output.',
        details: { workerPythonDir: this.workerPythonDir },
      });
    }

    try {
      return JSON.parse(output) as WorkerLabelPayload;
    } catch (error) {
      throw new InternalServerErrorException({
        code: 'WORKER_LABEL_INVALID_OUTPUT',
        message: 'The Python worker label generator returned invalid JSON.',
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
    return 'Unknown worker label error';
  }
}
