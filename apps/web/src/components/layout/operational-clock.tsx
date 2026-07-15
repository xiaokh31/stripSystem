"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../i18n/i18n-provider";
import { formatOperationalDateTime } from "../../lib/date-time";
import {
  OPERATIONAL_CLOCK_BREAKPOINT,
  startOperationalClockScheduler,
  type OperationalClockEnvironment,
} from "../../lib/operational-clock-scheduler";

export function OperationalClock({ initialIso }: { initialIso: string }) {
  // The clock has no UI copy of its own, but remains inside the explicit locale
  // boundary so a future in-place locale change cannot bypass the i18n contract.
  useI18n();
  const [clock, setClock] = useState(() => ({
    epochMs: new Date(initialIso).getTime(),
    renderCount: 0,
  }));
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(OPERATIONAL_CLOCK_BREAKPOINT);
    const environment: OperationalClockEnvironment<number> = {
      cancelTimer: (handle) => window.clearTimeout(handle),
      isDocumentVisible: () => document.visibilityState === "visible",
      isViewportVisible: () => mediaQuery.matches,
      now: () => Date.now(),
      scheduleTimer: (callback, delayMs) =>
        window.setTimeout(callback, delayMs),
      subscribeDocumentVisibility: (callback) => {
        document.addEventListener("visibilitychange", callback);
        return () => document.removeEventListener("visibilitychange", callback);
      },
      subscribeViewportVisibility: (callback) => {
        mediaQuery.addEventListener("change", callback);
        return () => mediaQuery.removeEventListener("change", callback);
      },
    };

    return startOperationalClockScheduler({
      environment,
      onRunningChange: setRunning,
      onTick: (epochMs) =>
        setClock((current) => ({
          epochMs,
          renderCount: current.renderCount + 1,
        })),
    });
  }, []);

  const date = new Date(clock.epochMs);
  const isoValue = date.toISOString();

  return (
    <time
      className="font-data mt-1 block"
      data-clock-render-count={clock.renderCount}
      data-clock-running={running}
      data-operational-clock="true"
      dateTime={isoValue}
    >
      {formatOperationalDateTime(date)}
    </time>
  );
}
