import { expect, test } from "@playwright/test";
import {
  cleanupUnloadingWageFixture,
  unloadingWageFixtureCount,
} from "./fixtures/unloading-wage-fixture";

test("shell fallback removes every requested unloading wage fixture", () => {
  test.skip(
    process.env.UNLOADING_WAGE_CLEANUP_ONLY !== "1",
    "Cleanup-only entrypoint for the unloading wage shell EXIT trap.",
  );

  const prefixes = requiredEnv("UNLOADING_WAGE_CLEANUP_PREFIXES")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  expect(prefixes.length).toBeGreaterThan(0);

  for (const prefix of prefixes) {
    cleanupUnloadingWageFixture(prefix);
    expect(unloadingWageFixtureCount(prefix)).toBe(0);
  }
});

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for unloading wage cleanup.`);
  }
  return value;
}
