import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardActivityPrimaryLabel,
  dashboardActivityStatusLabel,
  dashboardEmptyLabel,
  dashboardHref,
  dashboardLabel,
  dashboardLifecycleLabel,
  dashboardRangeLabel,
  dashboardSeverityTone,
  dashboardUnavailableMessage,
  normalizeDashboardFilters,
} from "../src/components/dashboard/operations-dashboard-flow";

test("normalizes dashboard filters and builds stable hrefs", () => {
  assert.deepEqual(
    normalizeDashboardFilters({ month: "2026-07", range: "7d" }),
    { month: "2026-07", range: "7d" },
  );
  assert.deepEqual(
    normalizeDashboardFilters({ month: "bad", range: "invalid" }),
    { month: undefined, range: "today" },
  );
  assert.equal(dashboardHref({ range: "today" }), "/");
  assert.equal(
    dashboardHref({ month: "2026-07", range: "30d" }),
    "/?range=30d&month=2026-07",
  );
});

test("maps dashboard labels and lifecycle statuses through locale helpers", () => {
  assert.equal(
    dashboardLabel("dashboard.workQueue.importsAwaitingParse", "zh-CN"),
    "待解析导入",
  );
  assert.equal(dashboardRangeLabel("7d", "zh-CN"), "7 天");
  assert.equal(
    dashboardLifecycleLabel(
      {
        code: "LOADED",
        labelKey: "dashboard.lifecycle.deliveredToDestination",
      },
      "zh-CN",
    ),
    "已送库",
  );
  assert.equal(dashboardSeverityTone("blocked"), "danger");
});

test("maps empty, unavailable, and activity copy without exposing API keys", () => {
  assert.equal(
    dashboardEmptyLabel("IMPORTS_AWAITING_PARSE", "zh-CN"),
    "没有待解析导入",
  );
  assert.equal(
    dashboardUnavailableMessage("inventory", "zh-CN"),
    "此账号不可查看库存压力。",
  );
  assert.equal(
    dashboardActivityPrimaryLabel(
      {
        href: "/containers/1",
        id: "1",
        kind: "CORRECTION",
        label: "destinationCode",
        occurredAt: "2026-07-10T12:00:00.000Z",
        status: "CONTAINER_DESTINATION",
      },
      "zh-CN",
    ),
    "已记录修正",
  );
  assert.equal(
    dashboardActivityStatusLabel(
      {
        href: "/reports/inventory",
        id: "2",
        kind: "CONTAINER",
        label: "CSNU1234567",
        occurredAt: "2026-07-10T12:00:00.000Z",
        status: "LOADED",
      },
      "zh-CN",
    ),
    "已送库",
  );
});
