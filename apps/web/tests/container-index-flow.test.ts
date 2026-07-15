import test from "node:test";
import assert from "node:assert/strict";
import {
  containerIndexHref,
  nextContainerIndexSort,
  normalizeContainerIndexFilters,
} from "../src/components/containers/container-index-flow";
import { containerStatusLabel } from "../src/components/containers/container-files-flow";
import { formatLocalizedOperationalDateTime } from "../src/lib/date-time";

test("container index URL filters normalize defaults and reject unstable machine values", () => {
  assert.deepEqual(normalizeContainerIndexFilters({}), {
    direction: "desc",
    sort: "createdAt",
  });
  assert.deepEqual(
    normalizeContainerIndexFilters({
      containerNo: ["  AB12  ", "ignored"],
      direction: "asc",
      sort: "containerNo",
    }),
    { containerNo: "AB12", direction: "asc", sort: "containerNo" },
  );
  assert.deepEqual(
    normalizeContainerIndexFilters({
      containerNo: "   ",
      direction: "sideways",
      sort: "translated-status",
    }),
    { direction: "desc", sort: "createdAt" },
  );
});

test("container index URLs serialize only stable English values and preserve search", () => {
  assert.equal(
    containerIndexHref({
      containerNo: "AB 12",
      direction: "asc",
      sort: "status",
    }),
    "/containers?containerNo=AB+12&sort=status&direction=asc",
  );
  assert.equal(
    containerIndexHref({ direction: "desc", sort: "createdAt" }),
    "/containers?sort=createdAt&direction=desc",
  );
});

test("sort toggle uses field-specific defaults then reverses the active direction", () => {
  assert.deepEqual(
    nextContainerIndexSort({ direction: "desc", sort: "createdAt" }, "containerNo"),
    { direction: "asc", sort: "containerNo" },
  );
  assert.deepEqual(
    nextContainerIndexSort({ direction: "asc", sort: "status" }, "status"),
    { direction: "desc", sort: "status" },
  );
  assert.deepEqual(
    nextContainerIndexSort({ direction: "desc", sort: "status" }, "status"),
    { direction: "asc", sort: "status" },
  );
});

test("created time uses locale-aware Edmonton formatting while status stays enum-localized", () => {
  const value = "2026-07-13T09:29:26.000Z";
  const english = formatLocalizedOperationalDateTime(value, "en");
  const chinese = formatLocalizedOperationalDateTime(value, "zh-CN");

  assert.match(english, /2026/);
  assert.match(english, /Jul/);
  assert.match(chinese, /2026年/);
  assert.notEqual(english, chinese);
  assert.equal(containerStatusLabel("LABELS_GENERATED", "en"), "Labels generated");
  assert.equal(containerStatusLabel("LABELS_GENERATED", "zh-CN"), "已生成面单");
});
