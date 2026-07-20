import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { AsyncJobsService } from './async-jobs.service';
import { AsyncJobGeneratedRefs, AsyncJobPayload } from './async-jobs.types';
import { AttendanceService } from '../attendance/attendance.service';
import { ImportsService } from '../imports/imports.service';
import { LabelsService } from '../labels/labels.service';
import { ReportsService } from '../reports/reports.service';
import { AsyncJobType } from '../generated/prisma/enums';
import { ParserLearningCasesService } from '../parser-learning-cases/parser-learning-cases.service';

interface ExceptionWithResponse {
  getResponse(): unknown;
}

@Injectable()
export class AsyncJobsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AsyncJobsProcessor.name);
  private worker?: Worker<AsyncJobPayload>;
  private shuttingDown = false;

  constructor(
    private readonly asyncJobs: AsyncJobsService,
    private readonly importsService: ImportsService,
    private readonly reportsService: ReportsService,
    private readonly labelsService: LabelsService,
    private readonly attendanceService: AttendanceService,
    private readonly parserLearningCasesService: ParserLearningCasesService,
  ) {}

  onModuleInit(): void {
    if (!this.asyncJobs.isEnabled()) {
      return;
    }

    this.worker = new Worker<AsyncJobPayload>(
      this.asyncJobs.getQueueName(),
      (job) => this.process(job),
      {
        connection: this.asyncJobs.createBullConnectionOptions(),
        concurrency: this.asyncJobs.getQueueConcurrency(),
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        `Async job ${job?.data.asyncJobId ?? job?.id ?? 'unknown'} failed: ${
          error.message
        }`,
      );
    });
    this.worker.on('error', (error: Error) => {
      if (this.shuttingDown && this.isExpectedRedisCloseError(error)) {
        return;
      }

      this.logger.warn(`Async job worker Redis error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      this.shuttingDown = true;
      const worker = this.worker;
      this.worker = undefined;
      try {
        await worker.close();
      } catch (error) {
        if (!this.isExpectedRedisCloseError(error)) {
          throw error;
        }
      }
    }
  }

  private async process(job: Job<AsyncJobPayload>): Promise<void> {
    const payload = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = Number(job.opts.attempts ?? 1);

    await this.asyncJobs.markRunning(payload.asyncJobId, job.id, attempt);

    try {
      const result = await this.runBusinessJob(payload);
      await this.asyncJobs.markSucceeded(
        payload.asyncJobId,
        result,
        this.generatedRefsFromResult(payload.jobType, result),
      );
    } catch (error) {
      if (attempt < maxAttempts) {
        await this.asyncJobs.markRetryableFailure(
          payload.asyncJobId,
          error,
          attempt,
        );
      } else {
        await this.asyncJobs.markFailed(
          payload.asyncJobId,
          error,
          attempt,
          this.generatedRefsFromError(payload.jobType, error),
        );
      }

      throw error;
    }
  }

  private async runBusinessJob(payload: AsyncJobPayload): Promise<unknown> {
    switch (payload.jobType) {
      case AsyncJobType.UNLOADING_PARSE:
        return this.importsService.parse(payload.targetId, payload.actor);
      case AsyncJobType.UNLOADING_REPORT:
        return this.reportsService.generateReport(
          payload.targetId,
          payload.actor,
        );
      case AsyncJobType.UNLOADING_LABELS:
        return this.labelsService.generateLabels(
          payload.targetId,
          payload.actor,
        );
      case AsyncJobType.ATTENDANCE_PARSE:
        return this.attendanceService.parse(payload.targetId);
      case AsyncJobType.WAGE_RECORD_GENERATION:
        return this.attendanceService.generateWageRecord(
          payload.targetId,
          payload.actor,
        );
      case AsyncJobType.PARSER_PROFILE_REPLAY:
        return this.parserLearningCasesService.executeReplayJob(
          payload.targetId,
          payload.actor,
          payload.asyncJobId,
          payload.metadata,
        );
      default:
        throw new Error('Unsupported async job type.');
    }
  }

  private generatedRefsFromResult(
    jobType: AsyncJobPayload['jobType'],
    result: unknown,
  ): AsyncJobGeneratedRefs {
    const generatedFileId = this.generatedFileIdFromResult(result);
    if (!generatedFileId) {
      return {};
    }

    return jobType === AsyncJobType.WAGE_RECORD_GENERATION
      ? { wageGeneratedFileId: generatedFileId }
      : { generatedFileId };
  }

  private generatedRefsFromError(
    jobType: AsyncJobPayload['jobType'],
    error: unknown,
  ): AsyncJobGeneratedRefs {
    const generatedFileId = this.generatedFileIdFromResult(
      this.exceptionResponse(error),
    );
    if (!generatedFileId) {
      return {};
    }

    return jobType === AsyncJobType.WAGE_RECORD_GENERATION
      ? { wageGeneratedFileId: generatedFileId }
      : { generatedFileId };
  }

  private generatedFileIdFromResult(result: unknown): string | null {
    const candidate = this.objectValue(result);
    const generatedFile = this.objectValue(candidate?.generatedFile);
    const details = this.objectValue(candidate?.details);
    const detailsGeneratedFile = this.objectValue(details?.generatedFile);
    return this.stringValue(generatedFile?.id ?? detailsGeneratedFile?.id);
  }

  private exceptionResponse(error: unknown): unknown {
    if (this.hasExceptionResponse(error)) {
      return error.getResponse();
    }

    return null;
  }

  private hasExceptionResponse(value: unknown): value is ExceptionWithResponse {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { getResponse?: unknown }).getResponse === 'function'
    );
  }

  private objectValue(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private isExpectedRedisCloseError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return (
      error.message.includes('Connection is closed') ||
      error.message.includes('Connection is closed.') ||
      error.message.includes('write EPIPE')
    );
  }
}
