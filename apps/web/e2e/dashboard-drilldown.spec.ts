import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type {
  AttendanceImportListResponse,
  ContainerIndexListResponse,
  ContainerSummaryListResponse,
  ImportFileListResponse,
  LoadJobListResponse,
  OperationsDashboardResponse,
  OperationsReviewResponse,
  UnloadingSummaryResponse,
  UnloadingWageSettlementListResponse,
} from "../src/lib/api-client";
import {
  DASHBOARD_ACTION_CLICK_SURFACES,
  DASHBOARD_AGGREGATE_CLICK_SURFACES,
  DASHBOARD_RECORD_CLICK_SURFACES,
} from "../tests/fixtures/dashboard-click-surface-inventory";
import {
  cleanupDashboardExitGateFixture,
  createDashboardExitGateFixture,
  dashboardExitGateFixtureCount,
  type DashboardExitGateFixture,
} from "./fixtures/dashboard-exit-gate-fixture";
import {
  authHeaders,
  expectNoPageError,
  loginThroughApi,
} from "./helpers";

interface AggregateSource {
  code: string;
  count: number;
  href: string;
  surfaceId: string;
}

interface TargetSnapshot {
  ids: string[];
  metric: number;
  visibleText?: string;
}

test("every aggregate preserves the source predicate through target results and browser history", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(420_000);
  const prefix = `DASH08-${uniqueSuffix(testInfo.project.name)}`;
  cleanupDashboardExitGateFixture(prefix);
  const fixture = createDashboardExitGateFixture(prefix);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    const token = await loginThroughApi(page, request);
    const month = operationalMonth();
    const dashboard = await getDashboard(request, token, month);
    const sources = dashboardAggregateSources(dashboard);
    expect(
      [...new Set(sources.map((source) => source.surfaceId))].sort(),
      "The live API must expose every registered aggregate surface.",
    ).toEqual(
      [...new Set(DASHBOARD_AGGREGATE_CLICK_SURFACES.map((surface) => surface.id))]
        .sort(),
    );

    for (const source of sources) {
      const target = await targetSnapshot(request, token, source);
      expect(
        target.metric,
        `${source.surfaceId} source count and target metric must share one predicate`,
      ).toBe(source.count);
      expect(
        target.ids,
        `${source.surfaceId} target ids must exclude its non-matching sentinel`,
      ).not.toContain(sentinelFor(source, fixture));

      await page.goto(`/?range=today&month=${month}`);
      await setLocale(page, "en");
      const link = dashboardSurfaceLink(page, source);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", source.href);
      await link.focus();
      await expect(link).toBeFocused();
      await link.press("Enter");
      await assertTargetPage(page, source, target, fixture);

      await page.goBack();
      await expect(page.locator('main[data-dashboard-page="true"]')).toBeVisible();
      await dashboardSurfaceLink(page, source).click();
      await assertTargetPage(page, source, target, fixture);

      await page.reload();
      await assertTargetPage(page, source, target, fixture);
      await page.goBack();
      await expect(page.locator('main[data-dashboard-page="true"]')).toBeVisible();
      await page.goForward();
      await assertTargetPage(page, source, target, fixture);

      const clear = page.getByRole("link", { name: "View all", exact: true });
      await expect(clear).toBeVisible();
      await clear.click();
      await expect(page.locator('[data-dashboard-filter-context="true"]'))
        .toHaveCount(0);
      expect(new URL(page.url()).searchParams.has("from")).toBe(false);
      if (new URL(source.href, "http://dashboard.local").pathname !== "/operations/review") {
        expect(new URL(page.url()).searchParams.has("code")).toBe(false);
      }
      await expectNoPageError(page);
    }

    await assertZeroResult(page, fixture);
    expect(consoleErrors, "Unexpected browser console errors").toEqual([]);
    expect(pageErrors, "Unexpected uncaught page errors").toEqual([]);
  } finally {
    cleanupDashboardExitGateFixture(prefix);
  }

  expect(dashboardExitGateFixtureCount(prefix)).toBe(0);
});

test("every record surface opens or selects the exact stable id", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const prefix = `DASH08-REC-${uniqueSuffix(testInfo.project.name)}`;
  cleanupDashboardExitGateFixture(prefix);
  const fixture = createDashboardExitGateFixture(prefix);

  try {
    await loginThroughApi(page, request);
    await page.goto(`/?range=today&month=${operationalMonth()}`);
    await setLocale(page, "en");

    const expected = [
      {
        id: fixture.plannedLoadJobId,
        surfaceId: "record.load-job.active",
        url: new RegExp(`selectedId=${fixture.plannedLoadJobId}`),
        selected: true,
      },
      {
        id: fixture.importAwaitingId,
        surfaceId: "record.recent.IMPORT",
        url: new RegExp(`/imports/${fixture.importAwaitingId}`),
      },
      {
        id: fixture.parsedContainerId,
        surfaceId: "record.recent.CONTAINER",
        url: new RegExp(`/containers/${fixture.parsedContainerId}`),
      },
      {
        id: fixture.dueLoadJobId,
        surfaceId: "record.recent.LOAD_JOB",
        url: new RegExp(`selectedId=${fixture.dueLoadJobId}`),
        selected: true,
      },
      {
        id: fixture.generatedFileId,
        surfaceId: "record.recent.GENERATED_FILE",
        url: new RegExp(`fileId=${fixture.generatedFileId}`),
        selected: true,
      },
      {
        id: fixture.correctionId,
        surfaceId: "record.recent.CORRECTION",
        url: new RegExp(`correctionId=${fixture.correctionId}`),
        selected: true,
      },
    ] as const;
    expect(expected.map((item) => item.surfaceId).sort()).toEqual(
      DASHBOARD_RECORD_CLICK_SURFACES.map((surface) => surface.id).sort(),
    );

    for (const record of expected) {
      await page.goto(`/?range=today&month=${operationalMonth()}`);
      const link = page.locator(
        `[data-click-surface-id="${record.surfaceId}"][data-record-id="${record.id}"]`,
      );
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(record.url);
      if ("selected" in record && record.selected) {
        await expect(
          page.locator(
            `[data-record-id="${record.id}"][data-selected-record="true"]`,
          ),
        ).toBeVisible();
      } else {
        await expect(page.locator(`[data-record-id="${record.id}"]`))
          .toBeVisible();
      }
      await page.reload();
      await expect(page).toHaveURL(record.url);
      await expectNoPageError(page);
    }
  } finally {
    cleanupDashboardExitGateFixture(prefix);
  }

  expect(dashboardExitGateFixtureCount(prefix)).toBe(0);
});

test("open-all and workflow shortcuts remain unfiltered and keyboard accessible", async ({
  page,
  request,
}) => {
  await loginThroughApi(page, request);
  await page.goto("/");
  await setLocale(page, "en");

  const surfaces = DASHBOARD_ACTION_CLICK_SURFACES.filter(
    (surface) => surface.type === "open-all" || surface.type === "shortcut",
  );
  for (const surface of surfaces) {
    await page.goto("/");
    const link = page.locator(`[data-click-surface-id="${surface.id}"]`);
    await expect(link).toHaveCount(1);
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).not.toContain("from=dashboard");
    expect(href).not.toContain("code=");
    await link.focus();
    await expect(link).toBeFocused();
    await link.press("Enter");
    await expect(page).toHaveURL(new RegExp(escapeRegExp(href!)));
    await expect(page.locator('[data-dashboard-filter-context="true"]'))
      .toHaveCount(0);
  }
});

async function getDashboard(
  request: APIRequestContext,
  token: string,
  month: string,
): Promise<OperationsDashboardResponse> {
  const response = await request.get(
    `/api/dashboard/operations?range=today&month=${month}`,
    { headers: authHeaders(token) },
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<OperationsDashboardResponse>;
}

function dashboardAggregateSources(
  dashboard: OperationsDashboardResponse,
): AggregateSource[] {
  const sources: AggregateSource[] = [
    ...dashboard.workQueue.items.map((item) => ({
      code: item.code,
      count: item.count,
      href: item.href,
      surfaceId: `aggregate.work-queue.${item.code}`,
    })),
    ...dashboard.containerLifecycle.stages.map((stage) => ({
      code: stage.code,
      count: stage.count,
      href: stage.href,
      surfaceId: `aggregate.lifecycle.${stage.code}`,
    })),
    ...dashboard.exceptionQueue.map((item) => ({
      code: item.code,
      count: item.count,
      href: item.href,
      surfaceId: `aggregate.exception.${item.code}`,
    })),
  ];
  if (dashboard.inventory) {
    sources.push(
      {
        code: "INVENTORY_ACTIVE",
        count: dashboard.inventory.activeTotalPallets,
        href: dashboard.inventory.hrefs.active,
        surfaceId: "aggregate.inventory.active",
      },
      {
        code: "INVENTORY_LOADED",
        count: dashboard.inventory.loadedPallets,
        href: dashboard.inventory.hrefs.loaded,
        surfaceId: "aggregate.inventory.loaded",
      },
      {
        code: "INVENTORY_REMAINING",
        count: dashboard.inventory.remainingPallets,
        href: dashboard.inventory.hrefs.remaining,
        surfaceId: "aggregate.inventory.remaining",
      },
      ...dashboard.inventory.topDestinations.map((destination) => ({
        code: "INVENTORY_DESTINATION_REMAINING",
        count: destination.remainingPallets,
        href: destination.href,
        surfaceId: "aggregate.inventory.destination-remaining",
      })),
    );
  }
  if (dashboard.loadJobs) {
    sources.push(
      {
        code: "OPEN_LOAD_JOBS",
        count: dashboard.loadJobs.openCount,
        href: dashboard.loadJobs.hrefs.open,
        surfaceId: "aggregate.load-jobs.open",
      },
      {
        code: "LOAD_JOBS_IN_PROGRESS",
        count: dashboard.loadJobs.inProgressCount,
        href: dashboard.loadJobs.hrefs.inProgress,
        surfaceId: "aggregate.load-jobs.in-progress",
      },
      {
        code: "LOAD_JOBS_DUE_TODAY",
        count: dashboard.loadJobs.dueTodayCount,
        href: dashboard.loadJobs.hrefs.dueToday,
        surfaceId: "aggregate.load-jobs.due-today",
      },
    );
  }
  if (dashboard.monthlySummary) {
    sources.push(
      {
        code: "MONTHLY_COMPLETED_CONTAINERS",
        count: dashboard.monthlySummary.completedContainerCount,
        href: dashboard.monthlySummary.hrefs.completedContainers,
        surfaceId: "aggregate.monthly.completed-containers",
      },
      {
        code: "MONTHLY_SUMMARY_ROWS",
        count: dashboard.monthlySummary.rowCount,
        href: dashboard.monthlySummary.hrefs.summaryRows,
        surfaceId: "aggregate.monthly.summary-rows",
      },
      {
        code: "UNLOADING_COMPLETION_DATE_MISSING",
        count: dashboard.monthlySummary.reviewWarningCount,
        href: dashboard.monthlySummary.hrefs.reviewWarnings,
        surfaceId: "aggregate.monthly.review-warnings",
      },
    );
  }
  if (dashboard.wageAndAttendance) {
    const wage = dashboard.wageAndAttendance;
    if (wage.attendanceImportsNeedingParse !== null) {
      sources.push({
        code: "ATTENDANCE_IMPORTS_NEED_PARSE",
        count: wage.attendanceImportsNeedingParse,
        href: wage.hrefs.attendance!,
        surfaceId: "aggregate.attendance.need-parse",
      });
    }
    if (wage.attendanceImportsWithErrors !== null) {
      sources.push({
        code: "ATTENDANCE_IMPORTS_WITH_ERRORS",
        count: wage.attendanceImportsWithErrors,
        href: wage.hrefs.attendanceErrors!,
        surfaceId: "aggregate.attendance.errors",
      });
    }
    if (wage.wageSettlementsNeedingReview !== null) {
      sources.push({
        code: "WAGE_SETTLEMENTS_NEED_REVIEW",
        count: wage.wageSettlementsNeedingReview,
        href: wage.hrefs.unloadingWage!,
        surfaceId: "aggregate.wage.review",
      });
    }
  }
  return sources;
}

async function targetSnapshot(
  request: APIRequestContext,
  token: string,
  source: AggregateSource,
): Promise<TargetSnapshot> {
  const target = new URL(source.href, "http://dashboard.local");
  const params = target.searchParams;
  params.delete("from");
  const drilldownCode = params.get("code");
  params.delete("code");
  const headers = authHeaders(token);

  if (target.pathname === "/imports") {
    params.set("limit", "100");
    params.set("offset", "0");
    const body = await getJson<ImportFileListResponse>(
      request,
      `/api/imports?${params}`,
      headers,
    );
    return {
      ids: body.items.map((item) => item.id),
      metric: body.items.length,
      visibleText: body.items[0]?.originalFilename,
    };
  }
  if (target.pathname === "/containers") {
    params.set("sort", "createdAt");
    params.set("direction", "desc");
    const body = await getJson<ContainerIndexListResponse>(
      request,
      `/api/containers?${params}`,
      headers,
    );
    return {
      ids: body.items.map((item) => item.containerId),
      metric: body.items.length,
      visibleText: body.items[0]?.containerNo,
    };
  }
  if (target.pathname === "/inventory") {
    params.set("page", "1");
    params.set("pageSize", "10");
    params.set("sortBy", "createdAt");
    params.set("sortDirection", "desc");
    const body = await getJson<ContainerSummaryListResponse>(
      request,
      `/api/reports/container-summary?${params}`,
      headers,
    );
    const metric =
      source.code === "INVENTORY_LOADED"
        ? body.totals.loadedPallets
        : source.code === "INVENTORY_ACTIVE"
          ? body.totals.activeTotalPallets
          : body.totals.remainingPallets;
    return {
      ids: body.items.map((item) => item.containerId),
      metric,
      visibleText: body.items[0]?.containerNo,
    };
  }
  if (target.pathname === "/load-jobs") {
    params.set("limit", "50");
    params.set("offset", "0");
    const body = await getJson<LoadJobListResponse>(
      request,
      `/api/load-jobs?${params}`,
      headers,
    );
    return {
      ids: body.items.map((item) => item.id),
      metric: body.totalItems,
      visibleText: body.items[0]?.loadNo ?? body.items[0]?.id,
    };
  }
  if (target.pathname === "/operations/review") {
    if (drilldownCode) params.set("code", drilldownCode);
    params.set("page", "1");
    params.set("pageSize", "25");
    const body = await getJson<OperationsReviewResponse>(
      request,
      `/api/dashboard/review?${params}`,
      headers,
    );
    return {
      ids: body.items.map((item) => item.id),
      metric: body.totalItems,
      visibleText: body.items[0]?.primaryValue ?? undefined,
    };
  }
  if (target.pathname === "/work-hours") {
    params.set("limit", "100");
    params.set("offset", "0");
    const body = await getJson<AttendanceImportListResponse>(
      request,
      `/api/attendance-imports?${params}`,
      headers,
    );
    return {
      ids: body.items.map((item) => item.id),
      metric: body.items.length,
      visibleText: body.items[0]?.originalFilename,
    };
  }
  if (target.pathname === "/unloading-wage") {
    const body = await getJson<UnloadingWageSettlementListResponse>(
      request,
      `/api/unloading-wage-settlements?${params}`,
      headers,
    );
    return {
      ids: body.items.map((item) => item.id),
      metric: body.items.length,
      visibleText: body.items[0]?.settlementMonth,
    };
  }
  if (target.pathname === "/unloading-summary") {
    const body = await getJson<UnloadingSummaryResponse>(
      request,
      `/api/unloading-summary?month=${params.get("month")}`,
      headers,
    );
    return {
      ids: [...new Set(body.rows.map((row) => row.containerId))],
      metric:
        source.code === "MONTHLY_SUMMARY_ROWS"
          ? body.rowCount
          : body.sourceContainerCount,
      visibleText: body.rows[0]?.containerNo,
    };
  }
  throw new Error(`No target snapshot adapter for ${source.href}`);
}

async function getJson<T>(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await request.get(path, { headers });
  expect(response.status(), `${path} should return 200`).toBe(200);
  return response.json() as Promise<T>;
}

function dashboardSurfaceLink(
  page: Page,
  source: AggregateSource,
): Locator {
  return page.locator(
    `[data-click-surface-id="${source.surfaceId}"][href="${cssEscape(source.href)}"]`,
  );
}

async function assertTargetPage(
  page: Page,
  source: AggregateSource,
  target: TargetSnapshot,
  fixture: DashboardExitGateFixture,
): Promise<void> {
  await expect(page).toHaveURL(new RegExp(escapeRegExp(source.href)));
  await expect(page.locator(`[data-drilldown-code="${source.code}"]`).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "View all", exact: true }))
    .toBeVisible();

  const firstId = target.ids[0];
  if (source.href.startsWith("/unloading-summary")) {
    await expect(
      page.locator(`a[href="/containers/${fixture.monthlyContainerId}"]`).first(),
    ).toBeVisible();
  } else if (
    firstId &&
    !source.href.startsWith("/work-hours")
  ) {
    await expect(page.locator(`[data-record-id="${firstId}"]`).first())
      .toBeVisible();
  } else if (target.visibleText) {
    await expect(page.getByText(target.visibleText, { exact: true }).first())
      .toBeVisible();
  } else {
    await expect(page.locator("body")).toContainText("No");
  }
  const sentinel = sentinelFor(source, fixture);
  if (sentinel) {
    await expect(page.locator(`[data-record-id="${sentinel}"]`)).toHaveCount(0);
    await expect(page.getByText(sentinel, { exact: true })).toHaveCount(0);
  }
}

function sentinelFor(
  source: AggregateSource,
  fixture: DashboardExitGateFixture,
): string {
  const byCode: Record<string, string> = {
    ACTIVE_LOAD_JOB: fixture.cancelledDueLoadJobId,
    ATTENDANCE_IMPORTS_NEED_PARSE: fixture.attendanceErrorId,
    ATTENDANCE_IMPORTS_WITH_ERRORS: fixture.attendanceNeedParseId,
    CONTAINERS_MISSING_LABELS: fixture.labelsContainerId,
    CONTAINERS_MISSING_REPORT: fixture.labelsContainerId,
    DESTINATION_CARTON_VOLUME_MISSING: fixture.normalLineId,
    FAILED_ASYNC_JOBS: fixture.asyncSucceededId,
    FAILED_GENERATED_FILES: fixture.generatedFileId,
    IMPORTS_AWAITING_PARSE: fixture.importErrorId,
    IMPORTS_PARSE_FAILED: fixture.importAwaitingId,
    INVENTORY_ACTIVE: fixture.cancelledPalletContainerId,
    INVENTORY_DESTINATION_REMAINING: fixture.cancelledPalletContainerId,
    INVENTORY_LOADED: fixture.parsedContainerId,
    INVENTORY_REMAINING: fixture.effectiveLoadedContainerId,
    LABELS_GENERATED: fixture.parsedContainerId,
    LOADED: fixture.parsedContainerId,
    LOADING_IN_PROGRESS: fixture.parsedContainerId,
    LOAD_JOBS_DUE_TODAY: fixture.cancelledDueLoadJobId,
    LOAD_JOBS_IN_PROGRESS: fixture.cancelledDueLoadJobId,
    MONTHLY_COMPLETED_CONTAINERS: fixture.settledContainerId,
    MONTHLY_SUMMARY_ROWS: fixture.settledContainerId,
    OPEN_LOAD_JOBS: fixture.cancelledDueLoadJobId,
    PARSED: fixture.effectiveLoadedContainerId,
    PARSER_ERRORS: fixture.importAwaitingId,
    REPORT_GENERATED: fixture.parsedContainerId,
    SCAN_EXCEPTIONS: fixture.normalPalletEventId,
    UNLOADED: fixture.parsedContainerId,
    UNLOADING_COMPLETION_DATE_MISSING: fixture.monthlyContainerId,
    UPLOADED: fixture.importErrorId,
    WAGE_SETTLEMENTS_NEED_REVIEW: fixture.wageNormalId,
    ZERO_VOLUME_WITH_CARTONS: fixture.normalLineId,
  };
  return byCode[source.code] ?? "";
}

async function assertZeroResult(
  page: Page,
  fixture: DashboardExitGateFixture,
): Promise<void> {
  const destination = `${fixture.inventoryDestinationCode}-NO-RESULT`;
  await page.goto(
    `/inventory?scope=REMAINING&destinationCode=${destination}&destinationMatch=EXACT&from=dashboard&code=INVENTORY_DESTINATION_REMAINING`,
  );
  await expect(
    page.locator('[data-drilldown-code="INVENTORY_DESTINATION_REMAINING"]'),
  ).toBeVisible();
  await expect(page.locator("[data-record-id]")).toHaveCount(0);
  await expect(page.locator("body")).toContainText(
    "No container inventory matched the selected filters.",
  );
}

async function setLocale(page: Page, locale: "en" | "zh-CN"): Promise<void> {
  if ((await page.locator("html").getAttribute("lang")) === locale) return;
  await page.getByRole("button", {
    name: locale === "en" ? "English" : "中文",
  }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

function operationalMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Edmonton",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Operational month unavailable.");
  return `${year}-${month}`;
}

function uniqueSuffix(projectName: string): string {
  return `${Date.now().toString(36)}${projectName
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 3)}`.toUpperCase();
}

function cssEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
