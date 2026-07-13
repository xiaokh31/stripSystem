import test from "node:test";
import assert from "node:assert/strict";
import {
  formatOperationalDateTime,
  OPERATIONAL_TIME_ZONE,
} from "../src/lib/date-time";

test("operational timestamps use the same public time zone on server and client", () => {
  assert.equal(OPERATIONAL_TIME_ZONE, "America/Edmonton");
  assert.equal(
    formatOperationalDateTime("2026-07-13T09:29:26.000Z"),
    "2026-07-13 03:29:26 MDT",
  );
});
