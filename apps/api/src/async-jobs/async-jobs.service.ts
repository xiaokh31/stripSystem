import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  AsyncJobResponseDto,
  QueueHealthResponseDto,
} from './async-job-response.dto';
import {
  AsyncJobGeneratedRefs,
  AsyncJobPayload,
  SubmitAsyncJobInput,
} from './async-jobs.types';
import { Prisma } from '../generated/prisma/client';
import { AsyncJobStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

type NullableJsonInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput;

interface AsyncJobRecord {
  id: string;
  jobType: string;
  status: string;
  queueName: string;
  bullJobId: string | null;
  targetType: string;
  targetId: string;
  idempotencyKey: string;
  importFileId: string | null;
  containerId: string | null;
  attendanceImportId: string | null;
  parserLearningCaseId: string | null;
  generatedFileId: string | null;
  wageGeneratedFileId: string | null;
  actorUserId: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  result: unknown;
  metadata: unknown;
  queuedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  cancelledAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ExceptionWithResponse {
  getResponse(): unknown;
}

const ACTIVE_JOB_STATUSES = [AsyncJobStatus.QUEUED, AsyncJobStatus.RUNNING];

@Injectable()
export class AsyncJobsService implements OnModuleDestroy {
  private readonly logger = new Logger(AsyncJobsService.name);
  private readonly queueName: string;
  private readonly redisUrl?: string;
  private readonly enabled: boolean;
  private readonly queueConcurrency: number;
  private queue?: Queue<AsyncJobPayload, void, string>;
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.queueName =
      configService.get<string>('app.queueName') ?? 'bestar-async-jobs';
    this.redisUrl = configService.get<string>('app.redisUrl');
    this.enabled = configService.get<boolean>('app.queueEnabled') ?? false;
    this.queueConcurrency =
      configService.get<number>('app.queueConcurrency') ?? 2;
  }

  getQueueName(): string {
    return this.queueName;
  }

  getQueueConcurrency(): number {
    return this.queueConcurrency > 0 ? this.queueConcurrency : 1;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  createBullConnectionOptions(): Record<string, unknown> {
    if (!this.redisUrl) {
      throw this.queueUnavailable('REDIS_URL is not configured.');
    }

    return {
      ...this.redisConnectionOptions(this.redisUrl),
      maxRetriesPerRequest: null,
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      this.shuttingDown = true;
      const queue = this.queue;
      this.queue = undefined;
      try {
        await queue.close();
      } catch (error) {
        if (!this.isExpectedRedisCloseError(error)) {
          throw error;
        }
      }
    }
  }

  async submitJob(input: SubmitAsyncJobInput): Promise<AsyncJobResponseDto> {
    this.assertQueueEnabled();

    const idempotencyKey = this.idempotencyKey(input);
    const existing = await this.findByIdempotencyKey(
      idempotencyKey,
      input.reuseTerminal === true,
    );
    if (existing) {
      return this.toResponse(existing);
    }

    const maxAttempts = this.maxAttempts(input.maxAttempts);
    let record: AsyncJobRecord;
    try {
      record = await this.prisma.asyncJob.create({
        data: {
          jobType: input.jobType,
          status: AsyncJobStatus.QUEUED,
          queueName: this.queueName,
          targetType: input.targetType,
          targetId: input.targetId,
          idempotencyKey,
          importFileId: input.importFileId ?? null,
          containerId: input.containerId ?? null,
          attendanceImportId: input.attendanceImportId ?? null,
          parserLearningCaseId: input.parserLearningCaseId ?? null,
          actorUserId: input.actor.id,
          maxAttempts,
          metadata: this.nullableJsonValue({
            ...input.metadata,
            actor: this.actorSnapshot(input.actor),
          }),
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const raced = await this.findByIdempotencyKey(
          idempotencyKey,
          input.reuseTerminal === true,
        );
        if (raced) {
          return this.toResponse(raced);
        }
      }
      throw error;
    }

    const payload: AsyncJobPayload = {
      asyncJobId: record.id,
      jobType: input.jobType,
      targetType: input.targetType,
      targetId: input.targetId,
      actor: input.actor,
      metadata: input.metadata,
    };

    try {
      const bullJob = await this.getQueue().add(input.jobType, payload, {
        jobId: record.id,
        attempts: maxAttempts,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: {
          age: 7 * 24 * 60 * 60,
          count: 1_000,
        },
        removeOnFail: false,
      });

      record = await this.prisma.asyncJob.update({
        where: { id: record.id },
        data: { bullJobId: bullJob.id ?? record.id },
      });
    } catch (error) {
      const failed = (await this.prisma.asyncJob.update({
        where: { id: record.id },
        data: {
          status: AsyncJobStatus.FAILED,
          lastError: this.errorMessage(error),
          finishedAt: new Date(),
          result: this.nullableJsonValue({
            code: 'QUEUE_ENQUEUE_FAILED',
            message: this.errorMessage(error),
          }),
        },
      })) as AsyncJobRecord;

      throw new ServiceUnavailableException({
        code: 'QUEUE_ENQUEUE_FAILED',
        message: 'The job was recorded but could not be submitted to Redis.',
        details: {
          job: this.toResponse(failed),
          errorMessage: this.errorMessage(error),
        },
      });
    }

    return this.toResponse(record);
  }

  /**
   * Dispatches an AsyncJob row that was written as a transactional outbox
   * record by a business transaction. Repeated calls are safe because the
   * Bull job id is the database job id.
   */
  async dispatchRecordedJob(payload: AsyncJobPayload): Promise<AsyncJobResponseDto> {
    this.assertQueueEnabled();
    let record = await this.findJobOrThrow(payload.asyncJobId);
    if (
      record.jobType !== payload.jobType ||
      record.targetType !== payload.targetType ||
      record.targetId !== payload.targetId
    ) {
      throw new ServiceUnavailableException({
        code: 'ASYNC_JOB_OUTBOX_PAYLOAD_MISMATCH',
        message: 'ASYNC_JOB_OUTBOX_PAYLOAD_MISMATCH',
        details: { asyncJobId: payload.asyncJobId },
      });
    }
    try {
      const queue = this.getQueue();
      const existingBullJob = record.bullJobId
        ? await queue.getJob(record.bullJobId)
        : null;
      if (existingBullJob && record.status !== AsyncJobStatus.FAILED) {
        return this.toResponse(record);
      }
      if (existingBullJob && record.status === AsyncJobStatus.FAILED) {
        await existingBullJob.retry('failed');
      }
      const bullJob = existingBullJob ?? await queue.add(payload.jobType, payload, {
        jobId: record.id,
        attempts: record.maxAttempts,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: {
          age: 7 * 24 * 60 * 60,
          count: 1_000,
        },
        removeOnFail: false,
      });
      record = await this.prisma.asyncJob.update({
        where: { id: record.id },
        data: {
          status: AsyncJobStatus.QUEUED,
          bullJobId: bullJob.id ?? record.id,
          lastError: null,
          result: Prisma.JsonNull,
          finishedAt: null,
          cancelledAt: null,
        },
      });
      return this.toResponse(record);
    } catch (error) {
      record = await this.prisma.asyncJob.update({
        where: { id: record.id },
        data: {
          status: AsyncJobStatus.FAILED,
          lastError: this.errorMessage(error),
          result: this.nullableJsonValue({ code: 'QUEUE_ENQUEUE_FAILED' }),
          finishedAt: new Date(),
        },
      });
      throw new ServiceUnavailableException({
        code: 'QUEUE_ENQUEUE_FAILED',
        message: 'QUEUE_ENQUEUE_FAILED',
        details: { job: this.toResponse(record) },
      });
    }
  }

  async getJob(id: string): Promise<AsyncJobResponseDto> {
    const record = await this.findJobOrThrow(id);
    return this.toResponse(record);
  }

  async checkHealth(): Promise<QueueHealthResponseDto> {
    if (!this.enabled) {
      return {
        status: 'disabled',
        queueName: this.queueName,
        redisUrl: this.safeRedisUrl(),
        error: {
          code: 'QUEUE_DISABLED',
          message: 'Async job queue is disabled for this process.',
        },
      };
    }

    try {
      const redis = this.createRedisConnection();
      try {
        await redis.ping();
      } finally {
        redis.disconnect();
      }

      const queue = this.getQueue();
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
      );
      return {
        status: 'up',
        queueName: this.queueName,
        redisUrl: this.safeRedisUrl(),
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      };
    } catch (error) {
      return {
        status: 'down',
        queueName: this.queueName,
        redisUrl: this.safeRedisUrl(),
        error: {
          code: 'QUEUE_UNAVAILABLE',
          message: this.errorMessage(error),
        },
      };
    }
  }

  async markRunning(
    id: string,
    bullJobId: string | undefined,
    attempts: number,
  ): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id },
      data: {
        status: AsyncJobStatus.RUNNING,
        bullJobId: bullJobId ?? id,
        attempts,
        startedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markRetryableFailure(
    id: string,
    error: unknown,
    attempts: number,
  ): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id },
      data: {
        status: AsyncJobStatus.QUEUED,
        attempts,
        lastError: this.errorMessage(error),
        result: this.nullableJsonValue(this.errorResult(error)),
      },
    });
  }

  async markFailed(
    id: string,
    error: unknown,
    attempts: number,
    refs: AsyncJobGeneratedRefs = {},
  ): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id },
      data: {
        status: AsyncJobStatus.FAILED,
        attempts,
        lastError: this.errorMessage(error),
        result: this.nullableJsonValue(this.errorResult(error)),
        generatedFileId: refs.generatedFileId ?? null,
        wageGeneratedFileId: refs.wageGeneratedFileId ?? null,
        finishedAt: new Date(),
      },
    });
  }

  async markSucceeded(
    id: string,
    result: unknown,
    refs: AsyncJobGeneratedRefs = {},
  ): Promise<void> {
    await this.prisma.asyncJob.update({
      where: { id },
      data: {
        status: AsyncJobStatus.SUCCEEDED,
        lastError: null,
        result: this.nullableJsonValue(result),
        generatedFileId: refs.generatedFileId ?? null,
        wageGeneratedFileId: refs.wageGeneratedFileId ?? null,
        finishedAt: new Date(),
      },
    });
  }

  private getQueue(): Queue<AsyncJobPayload, void, string> {
    if (this.queue) {
      return this.queue;
    }

    const queue = new Queue<AsyncJobPayload, void, string>(this.queueName, {
      connection: this.createBullConnectionOptions(),
    });
    queue.on('error', (error: Error) => {
      if (this.shuttingDown && this.isExpectedRedisCloseError(error)) {
        return;
      }

      this.logger.warn(`Async job queue Redis error: ${error.message}`);
    });

    this.queue = queue;
    return this.queue;
  }

  private createRedisConnection(): IORedis {
    if (!this.redisUrl) {
      throw this.queueUnavailable('REDIS_URL is not configured.');
    }

    return new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  private redisConnectionOptions(redisUrl: string): Record<string, unknown> {
    const parsed = new URL(redisUrl);
    const database = parsed.pathname.replace('/', '');
    const options: Record<string, unknown> = {
      host: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    };

    if (parsed.username) {
      options.username = decodeURIComponent(parsed.username);
    }

    if (parsed.password) {
      options.password = decodeURIComponent(parsed.password);
    }

    if (database) {
      options.db = Number.parseInt(database, 10);
    }

    if (parsed.protocol === 'rediss:') {
      options.tls = {};
    }

    return options;
  }

  private async findJobOrThrow(id: string): Promise<AsyncJobRecord> {
    const record = await this.prisma.asyncJob.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'ASYNC_JOB_NOT_FOUND',
        message: `Async job ${id} was not found.`,
        details: { id },
      });
    }

    return record;
  }

  private async findByIdempotencyKey(
    idempotencyKey: string,
    includeTerminal = false,
  ): Promise<AsyncJobRecord | null> {
    return await this.prisma.asyncJob.findFirst({
      where: {
        idempotencyKey,
        ...(includeTerminal ? {} : { status: { in: ACTIVE_JOB_STATUSES } }),
      },
      orderBy: { queuedAt: 'desc' },
    });
  }

  private idempotencyKey(input: SubmitAsyncJobInput): string {
    return [
      input.jobType,
      input.targetType,
      input.targetId,
      input.idempotencyScope,
    ]
      .filter((value): value is string => Boolean(value))
      .join(':');
  }

  private maxAttempts(value: number | undefined): number {
    if (!Number.isFinite(value) || value === undefined) {
      return 2;
    }
    return Math.max(1, Math.min(Math.trunc(value), 5));
  }

  private assertQueueEnabled(): void {
    if (!this.enabled) {
      throw this.queueUnavailable('Async job queue is disabled.');
    }
  }

  private queueUnavailable(message: string): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'QUEUE_UNAVAILABLE',
      message,
      details: {
        queueName: this.queueName,
        redisUrl: this.safeRedisUrl(),
      },
    });
  }

  private actorSnapshot(actor: SubmitAsyncJobInput['actor']): unknown {
    return {
      id: actor.id,
      email: actor.email,
      name: actor.name,
      roles: actor.roles,
      permissions: actor.permissions,
    };
  }

  private errorResult(error: unknown): unknown {
    if (this.hasExceptionResponse(error)) {
      return error.getResponse();
    }

    return {
      code: 'ASYNC_JOB_FAILED',
      message: this.errorMessage(error),
    };
  }

  private hasExceptionResponse(value: unknown): value is ExceptionWithResponse {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { getResponse?: unknown }).getResponse === 'function'
    );
  }

  private nullableJsonValue(value: unknown): NullableJsonInput {
    if (value === undefined || value === null) {
      return Prisma?.JsonNull ?? (null as unknown as NullableJsonInput);
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized === 'null') {
      return Prisma?.JsonNull ?? (null as unknown as NullableJsonInput);
    }

    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private toResponse(record: AsyncJobRecord): AsyncJobResponseDto {
    return {
      id: record.id,
      jobType: record.jobType,
      status: this.toStatusDto(record.status),
      queueName: record.queueName,
      bullJobId: record.bullJobId,
      targetType: record.targetType,
      targetId: record.targetId,
      idempotencyKey: record.idempotencyKey,
      importFileId: record.importFileId,
      containerId: record.containerId,
      attendanceImportId: record.attendanceImportId,
      parserLearningCaseId: record.parserLearningCaseId,
      generatedFileId: record.generatedFileId,
      wageGeneratedFileId: record.wageGeneratedFileId,
      actorUserId: record.actorUserId,
      attempts: record.attempts,
      maxAttempts: record.maxAttempts,
      lastError: record.lastError,
      result: record.result ?? null,
      metadata: record.metadata ?? null,
      queuedAt: this.toIsoString(record.queuedAt),
      startedAt: this.toNullableIsoString(record.startedAt),
      finishedAt: this.toNullableIsoString(record.finishedAt),
      cancelledAt: this.toNullableIsoString(record.cancelledAt),
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private toStatusDto(status: string): AsyncJobResponseDto['status'] {
    switch (status) {
      case AsyncJobStatus.QUEUED:
        return 'queued';
      case AsyncJobStatus.RUNNING:
        return 'running';
      case AsyncJobStatus.SUCCEEDED:
        return 'succeeded';
      case AsyncJobStatus.FAILED:
        return 'failed';
      case AsyncJobStatus.CANCELLED:
        return 'cancelled';
      default:
        return 'failed';
    }
  }

  private safeRedisUrl(): string | null {
    if (!this.redisUrl) {
      return null;
    }

    return this.redisUrl.replace(/(:\/\/[^:]+:)[^@]+@/, '$1***@');
  }

  private toNullableIsoString(value: Date | string | null): string | null {
    return value === null ? null : this.toIsoString(value);
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Async job failed';
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isExpectedRedisCloseError(error: unknown): boolean {
    const message = this.errorMessage(error);
    return (
      message.includes('Connection is closed') ||
      message.includes('Connection is closed.') ||
      message.includes('write EPIPE')
    );
  }
}
