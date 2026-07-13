import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  ensureTestUser,
  expectNoPageError,
  loginThroughApi,
  loginWithCredentials,
  type E2ETestUser,
} from "./helpers";

const dashboardUsers = [
  {
    email: "e2e-dashboard-office@bestarcca.com",
    name: "E2E Dashboard Office",
    password: "Bestar-E2E-Dashboard-Office-123!",
    roleCodes: ["OFFICE"],
  },
  {
    email: "e2e-dashboard-warehouse@bestarcca.com",
    name: "E2E Dashboard Warehouse",
    password: "Bestar-E2E-Dashboard-Warehouse-123!",
    roleCodes: ["WAREHOUSE"],
  },
  {
    email: "e2e-dashboard-hr-manager@bestarcca.com",
    name: "E2E Dashboard HR Manager",
    password: "Bestar-E2E-Dashboard-HR-123!",
    roleCodes: ["HR_MANAGER"],
  },
  {
    email: "e2e-dashboard-warehouse-manager@bestarcca.com",
    name: "E2E Dashboard Warehouse Manager",
    password: "Bestar-E2E-Dashboard-WM-123!",
    roleCodes: ["WAREHOUSE_MANAGER"],
  },
] as const;

const forbiddenBilingualPatterns = [
  /已拆完\s*\(UNLOADED\)/,
  /已送库\s*\(LOADED\)/,
  /Delivered to destination\s*\/\s*已送库/,
  /Unloaded\s*\/\s*已拆完/,
] as const;

test("operations dashboard trims visible sections by role", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const adminToken = await loginThroughApi(page, request);
  const users = Object.fromEntries(
    await Promise.all(
      dashboardUsers.map(async (input) => [
        input.roleCodes[0],
        await ensureTestUser(request, adminToken, {
          ...input,
          roleCodes: [...input.roleCodes],
        }),
      ]),
    ),
  ) as Record<string, E2ETestUser>;

  await assertAdminDashboard(page);
  await assertOfficeDashboard(page, request, users.OFFICE);
  await assertWarehouseDashboard(page, request, users.WAREHOUSE);
  await assertHrDashboard(page, request, users.HR_MANAGER);
  await assertWarehouseManagerDashboard(
    page,
    request,
    users.WAREHOUSE_MANAGER,
  );
});

test("operations dashboard switches locale without mixed status text", async ({
  page,
  request,
}) => {
  await loginThroughApi(page, request);
  await page.goto("/");

  await switchToEnglish(page);
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Action queue");
  await expect(page.locator("body")).toContainText("Container lifecycle");
  await expectNoForbiddenDashboardText(page, "English dashboard");

  await switchToChinese(page);
  await expectDashboardChrome(page, "运营中控台");
  await expect(page.locator("body")).toContainText("行动队列");
  await expect(page.locator("body")).toContainText("柜子流转");
  await expect(page.locator("body")).not.toContainText("Action queue");
  await expect(page.locator("body")).not.toContainText("Container lifecycle");
  await expectNoForbiddenDashboardText(page, "Chinese dashboard");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expectDashboardChrome(page, "运营中控台");
  await expect(page.locator("body")).not.toContainText("dashboard.workQueue");

  await switchToEnglish(page);
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).not.toContainText("运营中控台");
  await expectNoPageError(page);
});

test("operations dashboard stays within the page viewport on desktop and mobile", async ({
  page,
  request,
}) => {
  await loginThroughApi(page, request);

  for (const viewport of [
    { height: 768, width: 1366 },
    { height: 1080, width: 1920 },
    { height: 844, width: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expectDashboardChrome(page, "Operations dashboard");
    await expectNoPageError(page);
    expect(
      await hasPageLevelHorizontalOverflow(page),
      `${viewport.width}x${viewport.height} should not create page-level horizontal overflow`,
    ).toBe(false);
  }
});

test("lifecycle dock strip keeps English and Chinese lanes aligned", async ({
  page,
  request,
}) => {
  await loginThroughApi(page, request);
  for (const [locale, heading] of [
    ["en", "Operations dashboard"],
    ["zh-CN", "运营中控台"],
  ] as const) {
    for (const viewport of [
      { height: 844, width: 390 },
      { height: 1024, width: 768 },
      { height: 768, width: 1366 },
      { height: 1080, width: 1920 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      if (locale === "zh-CN") await switchToChinese(page);
      await expectDashboardChrome(page, heading);
      const strip = page.locator(".lifecycle-dock-strip");
      await expect(strip).toBeVisible();
      await assertLifecycleLaneGeometry(page);
      await strip.screenshot({
        path: `test-results/dashboard-lifecycle-${locale}-${viewport.width}x${viewport.height}.png`,
      });
    }
  }

  await page.setViewportSize({ height: 768, width: 1366 });
  await page.goto("/");
  await switchToEnglish(page);
  for (const theme of ["Light theme", "Dark theme"] as const) {
    await page.getByRole("button", { name: theme }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme === "Light theme" ? "light" : "dark",
    );
    for (const scale of [1.25, 2]) {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
      await assertLifecycleLaneGeometry(page);
      await page.locator(".lifecycle-dock-strip").screenshot({
        path: `test-results/dashboard-lifecycle-en-${theme.startsWith("Light") ? "light" : "dark"}-1366x768-${scale}x.png`,
      });
      await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
      await session.detach();
    }
  }
});

async function assertAdminDashboard(page: Page): Promise<void> {
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Action queue");
  await expect(page.locator("body")).toContainText("Container lifecycle");
  await expect(page.locator("body")).toContainText("Inventory pressure");
  await expect(page.locator("body")).toContainText("Active load jobs");
  await expect(page.locator("body")).toContainText("Review queue");
  await expect(page.locator("body")).toContainText("Summary and wage queues");
  await expect(page.locator("body")).toContainText("Latest operational records");
  await expect(page.getByRole("link", { name: "Open admin users" }).first())
    .toBeVisible();
  await expect(page.locator("body")).not.toContainText("dashboard.workQueue");
  await expectNoForbiddenDashboardText(page, "ADMIN dashboard");
  await expectNoPageError(page);
}

async function assertOfficeDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Inventory pressure");
  await expect(page.locator("body")).toContainText("Active load jobs");
  await expect(page.locator("body")).toContainText("Summary and wage queues");
  await expect(page.getByRole("link", { name: "Open inventory" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open load jobs" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading summary" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open work hours" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open unloading wage" }))
    .toHaveCount(0);
  await expectNoPageError(page);
}

async function assertWarehouseDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Inventory pressure");
  await expect(page.locator("body")).toContainText("Active load jobs");
  await expect(page.getByRole("link", { name: "Open mobile scan" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading summary" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open work hours" }).first())
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open unloading wage" }).first())
    .toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Summary rows");
  await expectNoPageError(page);
}

async function assertHrDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText(
    "Inventory pressure is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText(
    "Load job progress is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText(
    "Attendance imports needing parse",
  );
  await expect(page.getByRole("link", { name: "Open work hours" }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading wage" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open inventory" }))
    .toHaveCount(0);
  await expectNoPageError(page);
}

async function assertWarehouseManagerDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText(
    "Inventory pressure is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText(
    "Load job progress is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText("Summary and wage queues");
  await expect(page.getByRole("link", { name: "Open unloading wage" }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading summary" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open work hours" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open inventory" }))
    .toHaveCount(0);
  await expectNoPageError(page);
}

async function expectDashboardChrome(
  page: Page,
  heading: string,
): Promise<void> {
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: heading }),
  ).toBeVisible();
}

async function switchToChinese(page: Page): Promise<void> {
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
}

async function switchToEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function expectNoForbiddenDashboardText(
  page: Page,
  context: string,
): Promise<void> {
  const text = await page.locator("body").innerText();
  for (const pattern of forbiddenBilingualPatterns) {
    expect(text, `${context} should not show ${pattern}`).not.toMatch(pattern);
  }
  expect(text, `${context} should not expose dashboard label keys`).not.toMatch(
    /dashboard\.(workQueue|lifecycle|exceptions)\./,
  );
}

async function hasPageLevelHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 4;
  });
}

async function assertLifecycleLaneGeometry(page: Page): Promise<void> {
  const result = await page.locator(".lifecycle-dock-strip > div").evaluate((strip) => {
    const lanes = [...strip.children].map((lane) => {
      const rect = lane.getBoundingClientRect();
      const label = lane.querySelector("p:nth-of-type(2)") as HTMLElement | null;
      const bar = lane.querySelector("div.h-3") as HTMLElement | null;
      const ratio = lane.querySelector("p:last-child") as HTMLElement | null;
      return {
        bottom: rect.bottom,
        label: label?.getBoundingClientRect(),
        ratio: ratio?.getBoundingClientRect(),
        top: rect.top,
        bar: bar?.getBoundingClientRect(),
      };
    });
    return { lanes, scrollWidth: strip.scrollWidth, width: strip.clientWidth };
  });
  expect(result.lanes).toHaveLength(7);
  const first = result.lanes[0]!;
  for (const lane of result.lanes) {
    expect(Math.abs(lane.top - first.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(lane.bottom - first.bottom)).toBeLessThanOrEqual(1);
    expect(lane.label!.right).toBeLessThanOrEqual(lane.bar!.right + 1);
    expect(lane.bar!.top).toBeCloseTo(first.bar!.top, 0);
    expect(lane.ratio!.top).toBeCloseTo(first.ratio!.top, 0);
  }
  expect(result.scrollWidth).toBeGreaterThan(0);
}
