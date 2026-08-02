import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1";

export default defineConfig({
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  testDir: "./e2e",
  timeout: 180_000,
  use: {
    baseURL,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  workers: 1,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
