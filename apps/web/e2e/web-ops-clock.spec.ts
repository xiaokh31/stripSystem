import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  expect,
  test,
  type CDPSession,
  type Page,
} from "@playwright/test";
import { loginThroughApi } from "./helpers";

const OUTPUT_DIR = "test-results/web-ops-04";
const CLOCK = 'time[data-operational-clock="true"]';
const WINDOW_MS = readWindowMs();

interface ClockSample {
  activeTimeouts: number;
  clockCount: number;
  clockRenderCount: number;
  clockRunning: boolean;
  documents: number;
  jsHeapUsedBytes: number;
  label: string;
  listenerCount: number;
  nodes: number;
  nonClockHeaderMutations: number;
  scriptDurationSeconds: number;
  taskDurationSeconds: number;
  timestamp: string;
  value: string;
}

interface ClockWindow {
  durationMs: number;
  end: ClockSample;
  label: string;
  start: ClockSample;
}

interface HiddenClockMeasurement {
  durationMs: number;
  renderCountAfterResume: number;
  renderCountBeforeHidden: number;
  visibilityTransitions: string[];
}

test("live operational clock stays isolated across locale, theme, and route changes", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const businessRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /hydration/i.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginThroughApi(page, request);
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/", { waitUntil: "networkidle" });

  const clock = page.locator(CLOCK);
  await expect(clock).toHaveCount(1);
  await expect(clock).toBeVisible();
  await expect(clock).toHaveAttribute("data-clock-running", "true");
  await expect(clock).not.toHaveAttribute("aria-live", /.+/);
  const firstValue = await clock.getAttribute("datetime");
  expect(Number.isNaN(Date.parse(firstValue ?? ""))).toBe(false);

  const firstText = await clock.textContent();
  await expect
    .poll(() => clock.textContent(), { timeout: 4_000 })
    .not.toBe(firstText);

  page.on("request", (requestEvent) => {
    const url = new URL(requestEvent.url());
    if (url.pathname.startsWith("/api/")) businessRequests.push(url.pathname);
  });
  await page.waitForTimeout(2_200);
  expect(businessRequests, "clock ticks must not poll any business API").toEqual([]);

  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(clock).toHaveCount(1);
  await expect(clock).toHaveAttribute("data-clock-running", "true");

  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(clock).toHaveCount(1);
  await expect(clock).toHaveAttribute("data-clock-running", "true");

  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByText("运营时间", { exact: true })).toBeVisible();
  await expect(page.getByText("Operational time", { exact: true })).toHaveCount(0);
  await expect(page.locator(CLOCK)).toHaveCount(1);
  await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "true");
  expect(consoleErrors, "clock must hydrate without warnings or page errors").toEqual([]);
});

test("CDP measurements keep clock heap, timers, listeners, and render scope bounded", async ({
  page,
  request,
}) => {
  test.setTimeout(600_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  await installBrowserProbe(page);
  await loginThroughApi(page, request);
  await page.setViewportSize({ height: 900, width: 1279 });
  await page.goto("/", { waitUntil: "networkidle" });
  await installHeaderMutationProbe(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  const windows: ClockWindow[] = [];

  await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "false");
  windows.push(await measureWindow(page, cdp, "static-1279-baseline"));
  expect(renderDelta(windows.at(-1)!)).toBe(0);

  await page.setViewportSize({ height: 900, width: 1366 });
  await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "true");
  windows.push(await measureWindow(page, cdp, "dynamic-window-1"));
  windows.push(await measureWindow(page, cdp, "dynamic-window-2"));
  const expectedTicks = WINDOW_MS / 1000;
  for (const window of windows.slice(-2)) {
    expect(renderDelta(window)).toBeGreaterThanOrEqual(
      Math.max(0, Math.floor(expectedTicks) - 2),
    );
    expect(renderDelta(window)).toBeLessThanOrEqual(
      Math.ceil(expectedTicks) + 2,
    );
    expect(window.end.nonClockHeaderMutations).toBe(
      window.start.nonClockHeaderMutations,
    );
    expect(window.end.listenerCount).toBe(window.start.listenerCount);
  }
  expect(windows.at(-1)!.end.clockCount).toBe(1);

  await page.setViewportSize({ height: 900, width: 1366 });
  await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "true");
  const hiddenMeasurement = await measureHiddenVisibilityContract(page);

  for (const width of [390, 768]) {
    await page.setViewportSize({ height: 900, width });
    await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "false");
    const startRenderCount = await clockRenderCount(page);
    await page.waitForTimeout(WINDOW_MS);
    expect(await clockRenderCount(page)).toBe(startRenderCount);
  }

  await page.setViewportSize({ height: 900, width: 1366 });
  await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "true");
  await expectClockWithinCurrentSecond(page);
  const finalSample = await collectSample(page, cdp, "final-resumed");
  const dynamicEndSamples = windows.slice(-2).map((window) => window.end);
  expect(dynamicEndSamples.map((sample) => sample.clockCount)).toEqual([1, 1]);
  expect(new Set(dynamicEndSamples.map((sample) => sample.listenerCount)).size).toBe(1);
  expect(finalSample.listenerCount).toBe(dynamicEndSamples.at(-1)!.listenerCount);

  await writeFile(
    path.resolve(OUTPUT_DIR, "clock-performance.json"),
    `${JSON.stringify(
      { finalSample, hiddenMeasurement, windowMs: WINDOW_MS, windows },
      null,
      2,
    )}\n`,
  );
});

async function measureHiddenVisibilityContract(
  page: Page,
): Promise<HiddenClockMeasurement> {
  await setDocumentVisibility(page, "hidden");
  await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "false");
  const renderCountBeforeHidden = await clockRenderCount(page);
  await page.waitForTimeout(WINDOW_MS);
  expect(await clockRenderCount(page)).toBe(renderCountBeforeHidden);

  await setDocumentVisibility(page, "visible");
  await expect(page.locator(CLOCK)).toHaveAttribute("data-clock-running", "true");
  await expectClockWithinCurrentSecond(page);
  const renderCountAfterResume = await clockRenderCount(page);
  expect(renderCountAfterResume - renderCountBeforeHidden).toBeGreaterThanOrEqual(1);
  expect(renderCountAfterResume - renderCountBeforeHidden).toBeLessThanOrEqual(2);

  return {
    durationMs: WINDOW_MS,
    renderCountAfterResume,
    renderCountBeforeHidden,
    visibilityTransitions: ["hidden", "visible"],
  };
}

async function setDocumentVisibility(
  page: Page,
  state: DocumentVisibilityState,
): Promise<void> {
  await page.evaluate((nextState) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => nextState,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function installBrowserProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type ProbeWindow = Window & {
      __webOpsClockProbe: {
        activeTimeouts: Set<number>;
        relevantListeners: Set<string>;
      };
    };
    const probeWindow = window as unknown as ProbeWindow;
    const activeTimeouts = new Set<number>();
    const relevantListeners = new Set<string>();
    const objectIds = new WeakMap<object, number>();
    let nextObjectId = 1;
    const objectId = (value: object) => {
      const existing = objectIds.get(value);
      if (existing) return existing;
      const assigned = nextObjectId;
      nextObjectId += 1;
      objectIds.set(value, assigned);
      return assigned;
    };
    const captureKey = (options?: boolean | AddEventListenerOptions) =>
      typeof options === "boolean" ? options : Boolean(options?.capture);

    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      let handle = 0;
      const wrapped = () => {
        activeTimeouts.delete(handle);
        if (typeof handler === "function") handler(...args);
      };
      handle = nativeSetTimeout(wrapped, timeout);
      activeTimeouts.add(handle);
      return handle;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((handle?: number) => {
      if (handle !== undefined) activeTimeouts.delete(handle);
      nativeClearTimeout(handle);
    }) as typeof window.clearTimeout;

    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (listener && isClockRelevantListener(this, type)) {
        relevantListeners.add(
          `${objectId(this)}:${type}:${objectId(listener)}:${captureKey(options)}`,
        );
      }
      nativeAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      if (listener && isClockRelevantListener(this, type)) {
        relevantListeners.delete(
          `${objectId(this)}:${type}:${objectId(listener)}:${captureKey(options)}`,
        );
      }
      nativeRemove.call(this, type, listener, options);
    };

    probeWindow.__webOpsClockProbe = { activeTimeouts, relevantListeners };

    function isClockRelevantListener(target: EventTarget, type: string): boolean {
      if (target === document && type === "visibilitychange") return true;
      return (
        type === "change" &&
        "media" in target &&
        (target as MediaQueryList).media === "(min-width: 1280px)"
      );
    }
  });
}

async function installHeaderMutationProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type ProbeWindow = Window & { __webOpsNonClockHeaderMutations: number };
    const probeWindow = window as unknown as ProbeWindow;
    probeWindow.__webOpsNonClockHeaderMutations = 0;
    const header = document.querySelector("header");
    if (!header) throw new Error("Office header is missing");
    new MutationObserver((records) => {
      for (const record of records) {
        const element =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (!element?.closest('time[data-operational-clock="true"]')) {
          probeWindow.__webOpsNonClockHeaderMutations += 1;
        }
      }
    }).observe(header, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
}

async function measureWindow(
  page: Page,
  cdp: CDPSession,
  label: string,
): Promise<ClockWindow> {
  const start = await collectSample(page, cdp, `${label}-start`);
  await page.waitForTimeout(WINDOW_MS);
  const end = await collectSample(page, cdp, `${label}-end`);
  return { durationMs: WINDOW_MS, end, label, start };
}

async function collectSample(
  page: Page,
  cdp: CDPSession,
  label: string,
): Promise<ClockSample> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const metric = (name: string) =>
    metrics.find((item) => item.name === name)?.value ?? 0;
  const browser = await page.evaluate((selector) => {
    type ProbeWindow = Window & {
      __webOpsClockProbe: {
        activeTimeouts: Set<number>;
        relevantListeners: Set<string>;
      };
      __webOpsNonClockHeaderMutations: number;
    };
    const probeWindow = window as unknown as ProbeWindow;
    const clock = document.querySelector<HTMLTimeElement>(selector);
    return {
      activeTimeouts: probeWindow.__webOpsClockProbe.activeTimeouts.size,
      clockCount: document.querySelectorAll(selector).length,
      clockRenderCount: Number(clock?.dataset.clockRenderCount ?? 0),
      clockRunning: clock?.dataset.clockRunning === "true",
      listenerCount: probeWindow.__webOpsClockProbe.relevantListeners.size,
      nonClockHeaderMutations:
        probeWindow.__webOpsNonClockHeaderMutations ?? 0,
      value: clock?.dateTime ?? "",
    };
  }, CLOCK);

  return {
    ...browser,
    documents: metric("Documents"),
    jsHeapUsedBytes: metric("JSHeapUsedSize"),
    label,
    nodes: metric("Nodes"),
    scriptDurationSeconds: metric("ScriptDuration"),
    taskDurationSeconds: metric("TaskDuration"),
    timestamp: new Date().toISOString(),
  };
}

function renderDelta(window: ClockWindow): number {
  return window.end.clockRenderCount - window.start.clockRenderCount;
}

async function clockRenderCount(page: Page): Promise<number> {
  return page.locator(CLOCK).evaluate((clock) =>
    Number((clock as HTMLTimeElement).dataset.clockRenderCount ?? 0),
  );
}

async function expectClockWithinCurrentSecond(page: Page): Promise<void> {
  const differenceMs = await page.locator(CLOCK).evaluate((clock) =>
    Math.abs(Date.now() - Date.parse((clock as HTMLTimeElement).dateTime)),
  );
  expect(differenceMs).toBeLessThan(1_100);
}

function readWindowMs(): number {
  const configured = Number(process.env.WEB_OPS_CLOCK_WINDOW_MS ?? 60_000);
  if (!Number.isFinite(configured) || configured < 1) {
    throw new Error("WEB_OPS_CLOCK_WINDOW_MS must be a positive number");
  }
  return configured;
}
