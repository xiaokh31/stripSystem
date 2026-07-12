export type StartupMark =
  | "process-start"
  | "first-shell"
  | "session-resolved"
  | "load-jobs-ready";

export interface StartupMetricSnapshot {
  marks: Partial<Record<StartupMark, number>>;
}

export class StartupMetrics {
  private readonly startedAt: number;
  private readonly marks: Partial<Record<StartupMark, number>> = {};

  constructor(now: () => number = Date.now) {
    this.startedAt = now();
    this.mark("process-start", now);
  }

  mark(name: StartupMark, now: () => number = Date.now): void {
    if (this.marks[name] === undefined) {
      this.marks[name] = Math.max(0, now() - this.startedAt);
    }
  }

  snapshot(): StartupMetricSnapshot {
    return { marks: { ...this.marks } };
  }
}

export const startupMetrics = new StartupMetrics();
