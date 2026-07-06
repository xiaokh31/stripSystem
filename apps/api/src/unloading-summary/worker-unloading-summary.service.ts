import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { UnloadingSummaryWorkerPayload } from './dto/unloading-summary.dto';

const execFileAsync = promisify(execFile);
const WORKER_TIMEOUT_MS = 120_000;
const WORKER_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

@Injectable()
export class WorkerUnloadingSummaryService {
  private readonly workerPythonDir: string;

  constructor(configService: ConfigService) {
    this.workerPythonDir = configService.getOrThrow<string>(
      'app.workerPythonDir',
    );
  }

  async writeSummary(
    request: Record<string, unknown>,
    outputDir: string,
  ): Promise<UnloadingSummaryWorkerPayload> {
    const tempDir = await mkdtemp(join(tmpdir(), 'bestar-unloading-summary-'));
    const payloadPath = join(tempDir, 'unloading-summary-payload.json');

    try {
      await mkdir(outputDir, { recursive: true });
      await writeFile(payloadPath, JSON.stringify(request), 'utf8');
      const { stdout } = await execFileAsync(
        'uv',
        [
          'run',
          'unloading-worker',
          'write-unloading-summary',
          '--payload',
          payloadPath,
          '--output-dir',
          outputDir,
        ],
        {
          cwd: this.workerPythonDir,
          encoding: 'utf8',
          timeout: WORKER_TIMEOUT_MS,
          maxBuffer: WORKER_MAX_BUFFER_BYTES,
        },
      );

      return this.parseWorkerStdout(stdout);
    } catch (error) {
      const payload = this.parseWorkerErrorStdout(error);
      if (payload) {
        return payload;
      }

      throw new InternalServerErrorException({
        code: 'WORKER_UNLOADING_SUMMARY_INVOCATION_FAILED',
        message:
          'The Python worker monthly unloading summary writer could not be executed.',
        details: {
          workerPythonDir: this.workerPythonDir,
          errorMessage: this.errorMessage(error),
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private parseWorkerErrorStdout(
    error: unknown,
  ): UnloadingSummaryWorkerPayload | null {
    if (!this.hasStdout(error)) {
      return null;
    }

    try {
      return this.parseWorkerStdout(error.stdout);
    } catch {
      return null;
    }
  }

  private parseWorkerStdout(stdout: string): UnloadingSummaryWorkerPayload {
    const output = stdout.trim();
    if (!output) {
      throw new InternalServerErrorException({
        code: 'WORKER_UNLOADING_SUMMARY_EMPTY_OUTPUT',
        message:
          'The Python worker monthly unloading summary writer returned no JSON output.',
        details: { workerPythonDir: this.workerPythonDir },
      });
    }

    try {
      return JSON.parse(output) as UnloadingSummaryWorkerPayload;
    } catch (error) {
      throw new InternalServerErrorException({
        code: 'WORKER_UNLOADING_SUMMARY_INVALID_OUTPUT',
        message:
          'The Python worker monthly unloading summary writer returned invalid JSON.',
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
    return 'Unknown worker unloading summary error';
  }
}
