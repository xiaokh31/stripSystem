import type { LoadJob, LoadJobProgress } from "./load-job-types";

export function loadJobDisplayName(loadJob: LoadJob): string {
  return loadJob.loadNo?.trim() || loadJob.id;
}

export function loadJobProgress(loadJob: LoadJob): LoadJobProgress {
  const planned = loadJob.plannedPalletCount;
  const loaded = loadJob.palletCount;
  return {
    loaded,
    planned,
    remaining: Math.max(0, planned - loaded),
  };
}

export function formatNullable(value: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Not set";
}

export function formatScheduledDeparture(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function loadJobLineSummary(loadJob: LoadJob): string {
  const internalLines = loadJob.lines
    .filter((line) => !line.externalTransfer)
    .slice(0, 3)
    .map((line) => line.sourceText ?? line.containerNo ?? line.destinationCode)
    .filter((value): value is string => Boolean(value));

  if (internalLines.length === 0) {
    return "No system pallet lines";
  }

  const suffix = loadJob.lines.length > internalLines.length ? " ..." : "";
  return `${internalLines.join(", ")}${suffix}`;
}
