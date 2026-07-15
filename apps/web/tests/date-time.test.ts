import test from "node:test";
import assert from "node:assert/strict";
import {
  createOperationalDateTimeFormatterCache,
  formatOperationalDateTime,
  OPERATIONAL_TIME_ZONE,
  resolveOperationalTimeZone,
} from "../src/lib/date-time";

test("operational timestamps use the same public time zone on server and client", () => {
  assert.equal(OPERATIONAL_TIME_ZONE, "America/Edmonton");
  assert.equal(
    formatOperationalDateTime("2026-07-13T09:29:26.000Z"),
    "2026-07-13 03:29:26 MDT",
  );
});

test("operational timestamps apply Edmonton daylight and standard time", () => {
  assert.equal(
    formatOperationalDateTime("2026-01-13T09:29:26.000Z"),
    "2026-01-13 02:29:26 MST",
  );
  assert.equal(
    formatOperationalDateTime("2026-07-13T09:29:26.000Z"),
    "2026-07-13 03:29:26 MDT",
  );
});

test("invalid dates remain visible for diagnosis", () => {
  assert.equal(formatOperationalDateTime("not-a-date"), "not-a-date");
});

test("operational time zone configuration falls back safely", () => {
  assert.equal(resolveOperationalTimeZone("America/Toronto"), "America/Toronto");
  assert.equal(resolveOperationalTimeZone("Invalid/Zone"), "America/Edmonton");
  assert.equal(resolveOperationalTimeZone(undefined), "America/Edmonton");
});

test("operational formatter is constructed once and reused across ticks", () => {
  let constructions = 0;
  const cache = createOperationalDateTimeFormatterCache((locale, options) => {
    constructions += 1;
    return new Intl.DateTimeFormat(locale, options);
  });

  const first = cache.get();
  for (let tick = 0; tick < 60; tick += 1) {
    assert.equal(cache.get(), first);
  }

  assert.equal(constructions, 1);
  assert.equal(cache.constructionCount(), 1);
});
