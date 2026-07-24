import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_DRILLDOWN_CODES,
  type DashboardDrilldownCode,
} from "../src/components/dashboard/drilldown-flow";
import {
  DASHBOARD_AGGREGATE_CLICK_SURFACES,
  DASHBOARD_CLICK_SURFACE_INVENTORY,
  DASHBOARD_RECORD_CLICK_SURFACES,
  DASHBOARD_RECENT_ACTIVITY_SURFACE_BY_KIND,
} from "./fixtures/dashboard-click-surface-inventory";

test("dashboard click-surface inventory has unique stable ids", () => {
  const ids = DASHBOARD_CLICK_SURFACE_INVENTORY.map((surface) => surface.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[a-z]+(?:[.-][A-Za-z0-9_-]+)+$/.test(id)));
});

test("dashboard inventory registers every typed aggregate and record drilldown code", () => {
  const registeredCodes = new Set<DashboardDrilldownCode>(
    [
      ...DASHBOARD_AGGREGATE_CLICK_SURFACES,
      ...DASHBOARD_RECORD_CLICK_SURFACES,
    ]
      .map((surface) => surface.code)
      .filter((code): code is DashboardDrilldownCode => Boolean(code)),
  );

  assert.deepEqual(
    [...registeredCodes].sort(),
    [...DASHBOARD_DRILLDOWN_CODES].sort(),
  );
});

test("dashboard inventory exhaustively registers every recent activity kind", () => {
  assert.deepEqual(Object.keys(DASHBOARD_RECENT_ACTIVITY_SURFACE_BY_KIND).sort(), [
    "CONTAINER",
    "CORRECTION",
    "GENERATED_FILE",
    "IMPORT",
    "LOAD_JOB",
  ]);
});
