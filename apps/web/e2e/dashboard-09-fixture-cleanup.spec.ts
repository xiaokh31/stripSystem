import { expect, test } from "@playwright/test";
import {
  cleanupDashboardClockIntegrityFixture,
  dashboardClockIntegrityFixtureCount,
} from "./fixtures/dashboard-clock-integrity-fixture";
import {
  cleanupUnloadingWageFixture,
  unloadingWageFixtureCount,
} from "./fixtures/unloading-wage-fixture";

test("shell fallback removes every WEB-DASHBOARD-09 fixture", () => {
  test.skip(
    process.env.WEB_DASHBOARD_09_CLEANUP_ONLY !== "1",
    "Cleanup-only entrypoint for the WEB-DASHBOARD-09 shell EXIT trap.",
  );

  const successPrefix = requiredEnv("UNLOADING_WAGE_SUCCESS_PREFIX");
  const failurePrefix = requiredEnv("UNLOADING_WAGE_FAILURE_PREFIX");
  const clockPrefix = requiredEnv("DASHBOARD_CLOCK_E2E_PREFIX");

  cleanupUnloadingWageFixture(successPrefix);
  cleanupUnloadingWageFixture(failurePrefix);
  cleanupDashboardClockIntegrityFixture(clockPrefix);

  expect(unloadingWageFixtureCount(successPrefix)).toBe(0);
  expect(unloadingWageFixtureCount(failurePrefix)).toBe(0);
  expect(dashboardClockIntegrityFixtureCount(clockPrefix)).toBe(0);
});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for WEB-DASHBOARD-09 cleanup.`);
  }
  return value;
}
