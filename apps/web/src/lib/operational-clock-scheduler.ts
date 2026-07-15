export const OPERATIONAL_CLOCK_BREAKPOINT = "(min-width: 1280px)";

export interface OperationalClockEnvironment<TimerHandle = unknown> {
  cancelTimer: (handle: TimerHandle) => void;
  isDocumentVisible: () => boolean;
  isViewportVisible: () => boolean;
  now: () => number;
  scheduleTimer: (callback: () => void, delayMs: number) => TimerHandle;
  subscribeDocumentVisibility: (callback: () => void) => () => void;
  subscribeViewportVisibility: (callback: () => void) => () => void;
}

export interface OperationalClockSchedulerOptions<TimerHandle = unknown> {
  environment: OperationalClockEnvironment<TimerHandle>;
  onRunningChange?: (running: boolean) => void;
  onTick: (epochMs: number) => void;
}

/**
 * Starts one self-correcting timer while the desktop clock is visible.
 * Every tick reads the current clock instead of accumulating elapsed seconds.
 */
export function startOperationalClockScheduler<TimerHandle>({
  environment,
  onRunningChange,
  onTick,
}: OperationalClockSchedulerOptions<TimerHandle>): () => void {
  let disposed = false;
  let running = false;
  let timer: TimerHandle | null = null;

  const stopTimer = () => {
    if (timer !== null) {
      environment.cancelTimer(timer);
      timer = null;
    }
  };

  const setRunning = (nextRunning: boolean) => {
    if (running !== nextRunning) {
      running = nextRunning;
      onRunningChange?.(running);
    }
  };

  const shouldRun = () =>
    environment.isDocumentVisible() && environment.isViewportVisible();

  const scheduleNextTick = (epochMs: number) => {
    const remainder = ((epochMs % 1000) + 1000) % 1000;
    const delayMs = remainder === 0 ? 1000 : 1000 - remainder;
    timer = environment.scheduleTimer(runTick, delayMs);
  };

  const runTick = () => {
    timer = null;
    if (disposed || !shouldRun()) {
      setRunning(false);
      return;
    }

    const epochMs = environment.now();
    onTick(epochMs);
    scheduleNextTick(epochMs);
  };

  const reconcile = () => {
    stopTimer();
    if (disposed || !shouldRun()) {
      setRunning(false);
      return;
    }

    setRunning(true);
    const epochMs = environment.now();
    onTick(epochMs);
    scheduleNextTick(epochMs);
  };

  const unsubscribeDocument =
    environment.subscribeDocumentVisibility(reconcile);
  const unsubscribeViewport =
    environment.subscribeViewportVisibility(reconcile);
  reconcile();

  return () => {
    if (disposed) {
      return;
    }

    disposed = true;
    stopTimer();
    running = false;
    unsubscribeDocument();
    unsubscribeViewport();
  };
}
