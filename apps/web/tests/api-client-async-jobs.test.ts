import test from "node:test";
import assert from "node:assert/strict";
import {
  getAsyncJob,
  getQueueHealth,
  submitAttendanceParseJob,
  submitAttendanceWageRecordJob,
  submitContainerLabelsJob,
  submitContainerReportJob,
  submitImportParseJob,
} from "../src/lib/api-client";

test("async job API client calls queue and job submission endpoints", async () => {
  const requests: Array<{ method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({
      method: init?.method ?? "GET",
      url,
    });

    const body = url.endsWith("/queue/health")
      ? {
          active: 0,
          queueName: "bestar-async-jobs",
          redisUrl: "redis://redis:6379",
          status: "up",
          waiting: 0,
        }
      : {
          actorUserId: "user-1",
          attempts: 0,
          attendanceImportId: url.includes("attendance-imports")
            ? "attendance 1"
            : null,
          bullJobId: "job-1",
          cancelledAt: null,
          containerId: url.includes("containers") ? "container 1" : null,
          createdAt: "2026-07-08T00:00:00.000Z",
          finishedAt: null,
          generatedFileId: null,
          id: "job-1",
          idempotencyKey: "test",
          importFileId: url.includes("imports") ? "import 1" : null,
          jobType: "UNLOADING_PARSE",
          lastError: null,
          maxAttempts: 2,
          metadata: null,
          queueName: "bestar-async-jobs",
          queuedAt: "2026-07-08T00:00:00.000Z",
          result: null,
          startedAt: null,
          status: "queued",
          targetId: "target-1",
          targetType: "IMPORT_FILE",
          updatedAt: "2026-07-08T00:00:00.000Z",
          wageGeneratedFileId: null,
        };

    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  const options = { baseUrl: "http://api.local/api", fetcher };
  await getQueueHealth(options);
  await submitImportParseJob("import 1", options);
  await submitContainerReportJob("container 1", options);
  await submitContainerLabelsJob("container 1", options);
  await submitAttendanceParseJob("attendance 1", options);
  await submitAttendanceWageRecordJob("attendance 1", options);
  const job = await getAsyncJob("job 1", options);

  assert.equal(job.id, "job-1");
  assert.deepEqual(requests, [
    {
      method: "GET",
      url: "http://api.local/api/queue/health",
    },
    {
      method: "POST",
      url: "http://api.local/api/imports/import%201/parse-job",
    },
    {
      method: "POST",
      url: "http://api.local/api/containers/container%201/generate-report-job",
    },
    {
      method: "POST",
      url: "http://api.local/api/containers/container%201/generate-labels-job",
    },
    {
      method: "POST",
      url: "http://api.local/api/attendance-imports/attendance%201/parse-job",
    },
    {
      method: "POST",
      url: "http://api.local/api/attendance-imports/attendance%201/generate-wage-record-job",
    },
    {
      method: "GET",
      url: "http://api.local/api/queue/jobs/job%201",
    },
  ]);
});
