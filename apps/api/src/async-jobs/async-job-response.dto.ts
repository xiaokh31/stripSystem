export type AsyncJobStatusDto =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface AsyncJobResponseDto {
  id: string;
  jobType: string;
  status: AsyncJobStatusDto;
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
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueueHealthResponseDto {
  status: 'up' | 'down' | 'disabled';
  queueName: string;
  redisUrl: string | null;
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
  error?: {
    code: 'QUEUE_UNAVAILABLE' | 'QUEUE_DISABLED';
    message: string;
  };
}
