import type { AuthenticatedUser } from '../auth/auth-user';
import { AsyncJobType } from '../generated/prisma/enums';

export const ASYNC_JOB_TARGET_TYPES = {
  importFile: 'IMPORT_FILE',
  container: 'CONTAINER',
  attendanceImport: 'ATTENDANCE_IMPORT',
  parserLearningCase: 'PARSER_LEARNING_CASE',
} as const;

export type AsyncJobTargetType =
  (typeof ASYNC_JOB_TARGET_TYPES)[keyof typeof ASYNC_JOB_TARGET_TYPES];

export interface AsyncJobPayload {
  asyncJobId: string;
  jobType: AsyncJobTypeValue;
  targetType: AsyncJobTargetType;
  targetId: string;
  actor: AuthenticatedUser;
  metadata?: Record<string, unknown>;
}

export type AsyncJobTypeValue =
  (typeof AsyncJobType)[keyof typeof AsyncJobType];

export interface SubmitAsyncJobInput {
  jobType: AsyncJobTypeValue;
  targetType: AsyncJobTargetType;
  targetId: string;
  actor: AuthenticatedUser;
  importFileId?: string | null;
  containerId?: string | null;
  attendanceImportId?: string | null;
  parserLearningCaseId?: string | null;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
  idempotencyScope?: string;
  reuseTerminal?: boolean;
}

export interface AsyncJobGeneratedRefs {
  generatedFileId?: string | null;
  wageGeneratedFileId?: string | null;
}
