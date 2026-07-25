import { mkdir } from "node:fs/promises";
import {
  expect,
  test,
  type Page,
} from "@playwright/test";
import {
  authHeaders,
  expectNoPageError,
  loginThroughApi,
} from "./helpers";
import {
  cleanupDashboardClockIntegrityFixture,
  dashboardClockIntegrityFixtureCount,
  dashboardClockIntegrityWriteSnapshot,
  seedDashboardClockIntegrityFixture,
} from "./fixtures/dashboard-clock-integrity-fixture";

const outputDir = "test-results/web-dashboard-09";
const clockSelector = 'time[data-operational-clock="true"]';

test("future records and a 2099 device clock cannot contaminate operations", async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await mkdir(outputDir, { recursive: true });
  const prefix =
    process.env.DASHBOARD_CLOCK_E2E_PREFIX ??
    `wd09-clock-${process.pid}-${Date.now()}`;
  const fixture = seedDashboardClockIntegrityFixture(prefix);
  const unexpectedErrors: string[] = [];
  let expectedCompletionFailure = false;
  page.on("console", (message) => {
    if (
      expectedCompletionFailure &&
      message.type() === "error" &&
      /Failed to load resource:.*400/.test(message.text())
    ) {
      return;
    }
    if (message.type() === "error" || /hydration/i.test(message.text())) {
      unexpectedErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => unexpectedErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (
      expectedCompletionFailure &&
      response.url().includes("/complete-unloading") &&
      response.status() === 400
    ) {
      return;
    }
    unexpectedErrors.push(`${response.status()} ${response.url()}`);
  });

  try {
    const token = await loginThroughApi(page, request);
    await page.addInitScript(() => {
      Date.now = () => Date.parse("2099-06-18T20:30:00.000Z");
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator('input[name="month"]')).not.toHaveValue(/2099/);
    await expect(page.locator(clockSelector)).toBeVisible();
    await expect(page.locator('[data-clock-drift-warning="true"]')).toHaveText(
      "Device time is out of sync",
    );
    const health = (await (await request.get("/api/health")).json()) as {
      serverTime: string;
    };
    const clockInstant = Date.parse(
      (await page.locator(clockSelector).getAttribute("datetime")) ?? "",
    );
    expect(Math.abs(clockInstant - Date.parse(health.serverTime))).toBeLessThan(
      15_000,
    );
    await screenshot(page, "01-dashboard-en-light-1366x768.png");

    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await screenshot(page, "02-clock-drift-en-dark-1366x768.png");

    const futureDashboardResponse = await request.get(
      "/api/dashboard/operations?month=2099-06",
      { headers: authHeaders(token) },
    );
    expect(futureDashboardResponse.status()).toBe(400);
    expect((await futureDashboardResponse.json()).code).toBe(
      "DASHBOARD_MONTH_IN_FUTURE",
    );

    await page.getByRole("button", { name: "Light theme" }).click();
    await page.goto(
      "/operations/review?code=UNLOADING_COMPLETION_DATE_IN_FUTURE&from=dashboard",
      { waitUntil: "networkidle" },
    );
    await expect(page.getByText(`${prefix}-PAY-FUTURE`).first()).toBeVisible();
    const detailLink = page.locator(
      `a[href="/containers/${fixture.futureContainerId}"]`,
    );
    await expect(detailLink).toBeVisible();
    await screenshot(page, "03-future-review-en-light-1366x768.png");

    const beforeWrite = dashboardClockIntegrityWriteSnapshot(prefix);
    const rejected = await request.post(
      `/api/containers/${fixture.historicalContainerId}/complete-unloading`,
      {
        data: {
          completedAt: "2099-06-18T20:30:00.000Z",
          note: "WEB-DASHBOARD-09 rejected future completion",
          reason: "WEB-DASHBOARD-09 future completion regression",
        },
        headers: authHeaders(token),
      },
    );
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).code).toBe(
      "UNLOADING_COMPLETION_DATE_IN_FUTURE",
    );
    expect(dashboardClockIntegrityWriteSnapshot(prefix)).toBe(beforeWrite);

    await detailLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/containers/${fixture.futureContainerId}$`),
    );
    const expand = page.getByRole("button", {
      name: "Expand unloading wage section",
    });
    if (await expand.isVisible()) await expand.click();
    await page.locator('input[type="datetime-local"]').fill("2099-07-18T20:30");
    expectedCompletionFailure = true;
    await page.getByRole("button", { name: "Mark unloaded" }).click();
    await expect(
      page.getByText(
        "Completion time cannot be more than five minutes after server time.",
      ),
    ).toBeVisible();
    expectedCompletionFailure = false;
    await page.getByRole("button", { name: "Dark theme" }).click();
    await screenshot(page, "04-completion-error-en-dark-1366x768.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("运营中控台", { exact: true })).toBeVisible();
    await expect(page.getByText("Operations Control Tower", { exact: true }))
      .toHaveCount(0);
    await expect(page.locator('input[name="month"]')).not.toHaveValue(/2099/);
    await page.getByRole("button", { name: "浅色主题" }).click();
    await screenshot(page, "05-dashboard-zh-light-390x844.png");

    await page.goto(
      "/operations/review?code=UNLOADING_COMPLETION_DATE_IN_FUTURE&from=dashboard",
      { waitUntil: "networkidle" },
    );
    await expect(page.getByText(`${prefix}-PAY-FUTURE`).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "未来拆柜完成时间" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "深色主题" }).click();
    await screenshot(page, "06-future-review-zh-dark-390x844.png");

    const noJsContext = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
    });
    try {
      const noJsPage = await noJsContext.newPage();
      await noJsPage.goto("/");
      await expect(noJsPage.locator("html")).toHaveAttribute("lang", "zh-CN");
      await expect(noJsPage.getByText("运营中控台", { exact: true })).toBeVisible();
      await expect(noJsPage.getByText("Operations Control Tower", { exact: true }))
        .toHaveCount(0);
    } finally {
      await noJsContext.close();
    }

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expectNoPageError(page);
    expect(unexpectedErrors).toEqual([]);
  } finally {
    cleanupDashboardClockIntegrityFixture(prefix);
    expect(dashboardClockIntegrityFixtureCount(prefix)).toBe(0);
  }
});

async function screenshot(page: Page, name: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.mouse.move(1, 1);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outputDir}/${name}` });
}
