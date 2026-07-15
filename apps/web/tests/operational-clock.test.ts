import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import test from "node:test";
import { OperationalClock } from "../src/components/layout/operational-clock";
import {
  startOperationalClockScheduler,
  type OperationalClockEnvironment,
} from "../src/lib/operational-clock-scheduler";

test("server clock markup preserves the initial value without hydration suppression", () => {
  const initialIso = "2026-07-13T09:29:26.123Z";
  const html = renderToString(createElement(OperationalClock, { initialIso }));

  assert.match(html, /data-operational-clock="true"/);
  assert.match(html, /dateTime="2026-07-13T09:29:26\.123Z"/);
  assert.match(html, /2026-07-13 03:29:26 MDT/);
  assert.doesNotMatch(html, /aria-live/);
  assert.doesNotMatch(html, /suppressHydrationWarning/);
});

test("visible desktop uses one aligned timer for sixty current-time ticks", () => {
  const fake = new FakeClockEnvironment(1_789_331_366_250);
  const ticks: number[] = [];
  const shellRenderCount = 1;
  const cleanup = startOperationalClockScheduler({
    environment: fake,
    onTick: (epochMs) => ticks.push(epochMs),
  });

  assert.deepEqual(ticks, [1_789_331_366_250]);
  assert.equal(fake.activeTimerCount, 1);
  assert.equal(fake.nextDelayMs, 750);

  for (let tick = 0; tick < 60; tick += 1) {
    fake.advanceToNextTimer(tick === 30 ? 1_013 : undefined);
    assert.equal(fake.activeTimerCount, 1);
  }

  assert.equal(ticks.length, 61);
  assert.equal(shellRenderCount, 1);
  assert.equal(ticks.at(-1), fake.now());
  assert.ok(
    fake.scheduledDelays.some((delay) => delay === 987),
    "a delayed callback must realign from Date.now instead of accumulating drift",
  );

  cleanup();
  assert.equal(fake.activeTimerCount, 0);
  assert.equal(fake.documentListenerCount, 0);
  assert.equal(fake.viewportListenerCount, 0);
});

test("hidden and narrow clocks pause, then resume immediately with one timer", () => {
  const fake = new FakeClockEnvironment(1_789_331_366_250);
  const ticks: number[] = [];
  const running: boolean[] = [];
  const cleanup = startOperationalClockScheduler({
    environment: fake,
    onRunningChange: (value) => running.push(value),
    onTick: (epochMs) => ticks.push(epochMs),
  });

  fake.setDocumentVisible(false);
  assert.equal(fake.activeTimerCount, 0);
  fake.elapseWithoutTimers(60_000);
  assert.equal(ticks.length, 1);

  fake.setDocumentVisible(true);
  assert.equal(ticks.at(-1), fake.now());
  assert.equal(fake.activeTimerCount, 1);

  fake.setViewportVisible(false);
  assert.equal(fake.activeTimerCount, 0);
  fake.elapseWithoutTimers(60_000);
  assert.equal(ticks.length, 2);

  fake.setViewportVisible(true);
  assert.equal(ticks.at(-1), fake.now());
  assert.equal(fake.activeTimerCount, 1);
  assert.deepEqual(running, [true, false, true, false, true]);

  cleanup();
  assert.equal(fake.activeTimerCount, 0);
  assert.equal(fake.documentListenerCount, 0);
  assert.equal(fake.viewportListenerCount, 0);

  const tickCountAfterCleanup = ticks.length;
  const runningChangesAfterCleanup = running.length;
  fake.emitDocumentVisibility();
  fake.emitViewportVisibility();
  fake.elapseWithoutTimers(60_000);
  assert.equal(ticks.length, tickCountAfterCleanup);
  assert.equal(running.length, runningChangesAfterCleanup);
});

class FakeClockEnvironment implements OperationalClockEnvironment<number> {
  private currentEpochMs: number;
  private documentVisible = true;
  private viewportVisible = true;
  private nextTimerHandle = 1;
  private readonly timers = new Map<
    number,
    { callback: () => void; delayMs: number; dueAt: number }
  >();
  private readonly documentListeners = new Set<() => void>();
  private readonly viewportListeners = new Set<() => void>();
  readonly scheduledDelays: number[] = [];

  constructor(initialEpochMs: number) {
    this.currentEpochMs = initialEpochMs;
  }

  get activeTimerCount(): number {
    return this.timers.size;
  }

  get documentListenerCount(): number {
    return this.documentListeners.size;
  }

  get nextDelayMs(): number | undefined {
    return [...this.timers.values()][0]?.delayMs;
  }

  get viewportListenerCount(): number {
    return this.viewportListeners.size;
  }

  cancelTimer = (handle: number) => {
    this.timers.delete(handle);
  };

  isDocumentVisible = () => this.documentVisible;

  isViewportVisible = () => this.viewportVisible;

  now = () => this.currentEpochMs;

  scheduleTimer = (callback: () => void, delayMs: number) => {
    const handle = this.nextTimerHandle;
    this.nextTimerHandle += 1;
    this.scheduledDelays.push(delayMs);
    this.timers.set(handle, {
      callback,
      delayMs,
      dueAt: this.currentEpochMs + delayMs,
    });
    return handle;
  };

  subscribeDocumentVisibility = (callback: () => void) => {
    this.documentListeners.add(callback);
    return () => this.documentListeners.delete(callback);
  };

  subscribeViewportVisibility = (callback: () => void) => {
    this.viewportListeners.add(callback);
    return () => this.viewportListeners.delete(callback);
  };

  advanceToNextTimer(extraDelayMs = 0): void {
    assert.equal(this.timers.size, 1);
    const [handle, timer] = [...this.timers.entries()][0];
    this.timers.delete(handle);
    this.currentEpochMs = timer.dueAt + extraDelayMs;
    timer.callback();
  }

  elapseWithoutTimers(durationMs: number): void {
    this.currentEpochMs += durationMs;
  }

  emitDocumentVisibility(): void {
    for (const callback of this.documentListeners) callback();
  }

  emitViewportVisibility(): void {
    for (const callback of this.viewportListeners) callback();
  }

  setDocumentVisible(visible: boolean): void {
    this.documentVisible = visible;
    this.emitDocumentVisibility();
  }

  setViewportVisible(visible: boolean): void {
    this.viewportVisible = visible;
    this.emitViewportVisibility();
  }
}
