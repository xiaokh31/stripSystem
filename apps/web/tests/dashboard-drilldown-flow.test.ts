import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardDrilldownLabel,
  normalizeDashboardDrilldownContext,
} from "../src/components/dashboard/drilldown-flow";

test("dashboard drilldown context accepts stable codes and rejects arbitrary routes", () => {
  assert.deepEqual(
    normalizeDashboardDrilldownContext({
      code: "IMPORTS_AWAITING_PARSE",
      from: "dashboard",
    }),
    { code: "IMPORTS_AWAITING_PARSE", from: "dashboard" },
  );
  assert.equal(
    normalizeDashboardDrilldownContext({
      code: "../../admin",
      from: "dashboard",
    }),
    null,
  );
  assert.equal(
    normalizeDashboardDrilldownContext({
      code: "IMPORTS_AWAITING_PARSE",
      from: "external",
    }),
    null,
  );
});

test("dashboard drilldown labels remain typed and single-language", () => {
  assert.equal(
    dashboardDrilldownLabel("INVENTORY_REMAINING", "en"),
    "Remaining pallets",
  );
  assert.equal(
    dashboardDrilldownLabel("INVENTORY_REMAINING", "zh-CN"),
    "剩余托盘",
  );
  assert.equal(
    dashboardDrilldownLabel("FAILED_ASYNC_JOBS", "zh-CN"),
    "失败异步任务",
  );
});
