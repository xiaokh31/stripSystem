import test from "node:test";
import assert from "node:assert/strict";
import { asyncJobFailureCode } from "../src/lib/async-job-polling";
import type { AsyncJobResponse } from "../src/lib/api-client";

test("async report failures expose only the stable result code to UI mapping", () => {
  const job = {
    id: "job-1",
    status: "failed",
    lastError: "raw internal worker message",
    result: {
      code: "REPORT_DESTINATION_CONSERVATION_FAILED",
      message: "REPORT_DESTINATION_CONSERVATION_FAILED",
      details: {
        stage: "reopen.row",
        expectedCount: 3,
        actualCount: 2,
      },
    },
  } as AsyncJobResponse;

  assert.equal(
    asyncJobFailureCode(job),
    "REPORT_DESTINATION_CONSERVATION_FAILED",
  );
  assert.equal(
    asyncJobFailureCode({ ...job, result: { message: "raw only" } }),
    null,
  );
});
