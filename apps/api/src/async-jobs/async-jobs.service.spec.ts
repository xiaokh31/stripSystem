import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncJobsService } from './async-jobs.service';
import { ASYNC_JOB_TARGET_TYPES } from './async-jobs.types';
import { AsyncJobStatus, AsyncJobType } from '../generated/prisma/enums';

describe('AsyncJobsService', () => {
  const actor = {
    id: 'user-1',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['imports.parse'],
  };

  let prisma: any;
  let service: AsyncJobsService;
  let queueAdd: jest.Mock;
  let queueGetJob: jest.Mock;

  beforeEach(() => {
    prisma = {
      asyncJob: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendanceImport: {
        findUnique: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    service = new AsyncJobsService(prisma, {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'app.queueName':
            return 'test-queue';
          case 'app.redisUrl':
            return 'redis://localhost:16379';
          case 'app.queueEnabled':
            return true;
          case 'app.queueConcurrency':
            return 2;
          default:
            return undefined;
        }
      }),
    } as unknown as ConfigService);
    queueAdd = jest.fn();
    queueGetJob = jest.fn();
    (service as unknown as { getQueue: () => unknown }).getQueue = () => ({
      add: queueAdd,
      getJob: queueGetJob,
    });
  });

  it('returns an active job for the same business target without enqueueing again', async () => {
    const existing = asyncJobRecord({
      id: 'job-existing',
      status: AsyncJobStatus.RUNNING,
    });
    prisma.asyncJob.findFirst.mockResolvedValue(existing);

    const response = await service.submitJob(parseJobInput());

    expect(response).toMatchObject({
      id: 'job-existing',
      status: 'running',
      idempotencyKey: 'UNLOADING_PARSE:IMPORT_FILE:import-1',
    });
    expect(prisma.asyncJob.create).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('reuses a terminal replay job when the caller owns a durable idempotency key', async () => {
    const existing = asyncJobRecord({
      id: 'job-completed',
      jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
      targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
      targetId: 'case-1',
      parserLearningCaseId: 'case-1',
      status: AsyncJobStatus.SUCCEEDED,
    });
    prisma.asyncJob.findFirst.mockResolvedValue(existing);

    const response = await service.submitJob({
      ...parseJobInput(),
      jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
      targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
      targetId: 'case-1',
      parserLearningCaseId: 'case-1',
      idempotencyScope: '1:request-0001',
      reuseTerminal: true,
    });

    expect(response).toMatchObject({
      id: 'job-completed',
      status: 'succeeded',
    });
    expect(prisma.asyncJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idempotencyKey:
            'PARSER_PROFILE_REPLAY:PARSER_LEARNING_CASE:case-1:1:request-0001',
        },
      }),
    );
    expect(prisma.asyncJob.create).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('records and enqueues a new BullMQ job', async () => {
    const created = asyncJobRecord({
      id: 'job-1',
      bullJobId: null,
      status: AsyncJobStatus.QUEUED,
    });
    const updated = { ...created, bullJobId: 'bull-job-1' };
    prisma.asyncJob.findFirst.mockResolvedValue(null);
    prisma.asyncJob.create.mockResolvedValue(created);
    prisma.asyncJob.update.mockResolvedValue(updated);
    queueAdd.mockResolvedValue({ id: 'bull-job-1' });

    const response = await service.submitJob(parseJobInput());

    expect(queueAdd).toHaveBeenCalledWith(
      AsyncJobType.UNLOADING_PARSE,
      expect.objectContaining({
        asyncJobId: 'job-1',
        targetId: 'import-1',
        actor,
      }),
      expect.objectContaining({
        jobId: 'job-1',
        attempts: 2,
      }),
    );
    expect(response).toMatchObject({
      id: 'job-1',
      status: 'queued',
      bullJobId: 'bull-job-1',
      importFileId: 'import-1',
    });
  });

  it('locks and rejects a deleted attendance import before recording its job', async () => {
    prisma.asyncJob.findFirst.mockResolvedValue(null);
    prisma.attendanceImport.findUnique.mockResolvedValue({
      id: 'attendance-import-1',
      deletedAt: new Date('2026-07-23T19:45:00.000Z'),
    });

    await expect(service.submitJob(attendanceParseJobInput())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTENDANCE_IMPORT_DELETED',
      }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT id FROM attendance_imports WHERE id = $1 FOR UPDATE',
      'attendance-import-1',
    );
    expect(prisma.asyncJob.create).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('marks the database job failed when Redis enqueue fails', async () => {
    const created = asyncJobRecord({
      id: 'job-1',
      bullJobId: null,
      status: AsyncJobStatus.QUEUED,
    });
    const failed = asyncJobRecord({
      ...created,
      status: AsyncJobStatus.FAILED,
      lastError: 'connect ECONNREFUSED',
      finishedAt: new Date('2026-07-08T12:00:00.000Z'),
    });
    prisma.asyncJob.findFirst.mockResolvedValue(null);
    prisma.asyncJob.create.mockResolvedValue(created);
    prisma.asyncJob.update.mockResolvedValue(failed);
    queueAdd.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(service.submitJob(parseJobInput())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.asyncJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: AsyncJobStatus.FAILED,
          lastError: 'connect ECONNREFUSED',
        }),
      }),
    );
  });

  it('re-dispatches a durable outbox row when its Bull job is missing', async () => {
    const recorded = asyncJobRecord({
      id: 'completion-job-1',
      bullJobId: 'completion-job-1',
      jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
      targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
      targetId: 'case-1',
      parserLearningCaseId: 'case-1',
      status: AsyncJobStatus.QUEUED,
    });
    prisma.asyncJob.findUnique.mockResolvedValue(recorded);
    prisma.asyncJob.update.mockResolvedValue(recorded);
    queueGetJob.mockResolvedValue(null);
    queueAdd.mockResolvedValue({ id: recorded.id });

    await service.dispatchRecordedJob({
      asyncJobId: recorded.id,
      jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
      targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
      targetId: 'case-1',
      actor,
      metadata: {
        draftRevision: 1,
        replayIdempotencyKey: 'completion-snapshot-1',
      },
    });

    expect(queueGetJob).toHaveBeenCalledWith(recorded.id);
    expect(queueAdd).toHaveBeenCalledWith(
      AsyncJobType.PARSER_PROFILE_REPLAY,
      expect.objectContaining({ asyncJobId: recorded.id }),
      expect.objectContaining({ jobId: recorded.id }),
    );
  });

  it('does not enqueue a duplicate when the durable Bull job still exists', async () => {
    const recorded = asyncJobRecord({
      id: 'completion-job-1',
      bullJobId: 'completion-job-1',
      jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
      targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
      targetId: 'case-1',
      parserLearningCaseId: 'case-1',
      status: AsyncJobStatus.RUNNING,
    });
    prisma.asyncJob.findUnique.mockResolvedValue(recorded);
    queueGetJob.mockResolvedValue({ id: recorded.id });

    await service.dispatchRecordedJob({
      asyncJobId: recorded.id,
      jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
      targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
      targetId: 'case-1',
      actor,
    });

    expect(queueAdd).not.toHaveBeenCalled();
    expect(prisma.asyncJob.update).not.toHaveBeenCalled();
  });

  it('returns disabled queue health without creating Redis or BullMQ clients', async () => {
    const disabledService = new AsyncJobsService(prisma, {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'app.queueName':
            return 'test-queue';
          case 'app.redisUrl':
            return 'redis://localhost:16379';
          case 'app.queueEnabled':
            return false;
          default:
            return undefined;
        }
      }),
    } as unknown as ConfigService);
    const createRedisConnection = jest.spyOn(
      disabledService as unknown as { createRedisConnection: () => unknown },
      'createRedisConnection',
    );
    const getQueue = jest.spyOn(
      disabledService as unknown as { getQueue: () => unknown },
      'getQueue',
    );

    await expect(disabledService.checkHealth()).resolves.toMatchObject({
      status: 'disabled',
      error: { code: 'QUEUE_DISABLED' },
    });
    expect(createRedisConnection).not.toHaveBeenCalled();
    expect(getQueue).not.toHaveBeenCalled();
  });

  it('returns queue health counts when Redis and BullMQ are reachable', async () => {
    const redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn(),
    };
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 1,
        active: 2,
        delayed: 3,
        failed: 4,
      }),
    };
    jest
      .spyOn(
        service as unknown as { createRedisConnection: () => unknown },
        'createRedisConnection',
      )
      .mockReturnValue(redis);
    jest
      .spyOn(service as unknown as { getQueue: () => unknown }, 'getQueue')
      .mockReturnValue(queue);

    await expect(service.checkHealth()).resolves.toMatchObject({
      status: 'up',
      waiting: 1,
      active: 2,
      delayed: 3,
      failed: 4,
    });
    expect(redis.disconnect).toHaveBeenCalled();
  });

  it('returns down queue health instead of throwing when Redis is unavailable', async () => {
    jest
      .spyOn(
        service as unknown as { createRedisConnection: () => unknown },
        'createRedisConnection',
      )
      .mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
        disconnect: jest.fn(),
      });

    await expect(service.checkHealth()).resolves.toMatchObject({
      status: 'down',
      error: {
        code: 'QUEUE_UNAVAILABLE',
        message: 'connect ECONNREFUSED',
      },
    });
  });

  it('returns stored job status for poll requests', async () => {
    const record = asyncJobRecord({
      id: 'job-1',
      status: AsyncJobStatus.SUCCEEDED,
      result: { parsedContainers: 1 },
      finishedAt: new Date('2026-07-08T12:03:00.000Z'),
    });
    prisma.asyncJob.findUnique.mockResolvedValue(record);

    await expect(service.getJob('job-1')).resolves.toMatchObject({
      id: 'job-1',
      status: 'succeeded',
      result: { parsedContainers: 1 },
      finishedAt: '2026-07-08T12:03:00.000Z',
    });
  });

  it('persists final failure result details for failed jobs', async () => {
    await service.markFailed('job-1', new Error('parser crashed'), 2);

    expect(prisma.asyncJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: AsyncJobStatus.FAILED,
        attempts: 2,
        lastError: 'parser crashed',
        result: {
          code: 'ASYNC_JOB_FAILED',
          message: 'parser crashed',
        },
        finishedAt: expect.any(Date),
      }),
    });
  });

  function parseJobInput() {
    return {
      jobType: AsyncJobType.UNLOADING_PARSE,
      targetType: ASYNC_JOB_TARGET_TYPES.importFile,
      targetId: 'import-1',
      importFileId: 'import-1',
      actor,
      metadata: {
        sourceRoute: 'POST /imports/:id/parse-job',
      },
    };
  }

  function attendanceParseJobInput() {
    return {
      jobType: AsyncJobType.ATTENDANCE_PARSE,
      targetType: ASYNC_JOB_TARGET_TYPES.attendanceImport,
      targetId: 'attendance-import-1',
      attendanceImportId: 'attendance-import-1',
      actor,
      metadata: {
        sourceRoute: 'POST /attendance-imports/:id/parse-job',
      },
    };
  }

  function asyncJobRecord(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-07-08T12:00:00.000Z');
    return {
      id: 'job-1',
      jobType: AsyncJobType.UNLOADING_PARSE,
      status: AsyncJobStatus.QUEUED,
      queueName: 'test-queue',
      bullJobId: 'bull-job-1',
      targetType: ASYNC_JOB_TARGET_TYPES.importFile,
      targetId: 'import-1',
      idempotencyKey: 'UNLOADING_PARSE:IMPORT_FILE:import-1',
      importFileId: 'import-1',
      containerId: null,
      attendanceImportId: null,
      generatedFileId: null,
      wageGeneratedFileId: null,
      actorUserId: 'user-1',
      attempts: 0,
      maxAttempts: 2,
      lastError: null,
      result: null,
      metadata: null,
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }
});
