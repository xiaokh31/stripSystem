import test from "node:test";
import assert from "node:assert/strict";
import { StartupMetrics } from "../src/app/startup-metrics";

test("startup metrics record first occurrences without request or credential data", () => {
  let now = 1_000;
  const metrics = new StartupMetrics(() => now);
  now = 1_400;
  metrics.mark("first-shell", () => now);
  now = 2_100;
  metrics.mark("session-resolved", () => now);
  now = 2_900;
  metrics.mark("first-shell", () => now);

  assert.deepEqual(metrics.snapshot(), {
    marks: {
      "first-shell": 400,
      "process-start": 0,
      "session-resolved": 1_100,
    },
  });
});
