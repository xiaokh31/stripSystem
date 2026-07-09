import { getAsyncJob, type AsyncJobResponse } from "./api-client";

interface WaitForAsyncJobOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

const TERMINAL_STATUSES = new Set<AsyncJobResponse["status"]>([
  "succeeded",
  "failed",
  "cancelled",
]);

export async function waitForAsyncJob(
  jobId: string,
  options: WaitForAsyncJobOptions = {},
): Promise<AsyncJobResponse> {
  const intervalMs = options.intervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const job = await getAsyncJob(jobId);
    if (TERMINAL_STATUSES.has(job.status)) {
      return job;
    }

    await delay(intervalMs);
  }

  throw new Error(`Async job ${jobId} did not finish within ${timeoutMs}ms.`);
}

export function asyncJobFailureMessage(job: AsyncJobResponse): string {
  if (job.lastError) {
    return job.lastError;
  }

  const result = objectValue(job.result);
  const message = result ? stringValue(result.message) : null;
  return message ?? `Async job ${job.id} ended with status ${job.status}.`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
