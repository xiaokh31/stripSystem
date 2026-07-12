import type { LoadJob, LoadJobProgress } from "./load-job-types";

export function bayBoardJobs(loadJobs: readonly LoadJob[], query: string): LoadJob[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return loadJobs
    .filter((loadJob) => matchesBayBoardQuery(loadJob, normalizedQuery))
    .slice()
    .sort(compareBayBoardJobs);
}

export function compareBayBoardJobs(left: LoadJob, right: LoadJob): number {
  return (
    statusRank(left) - statusRank(right) ||
    Number(right.canScan) - Number(left.canScan) ||
    scheduledRank(left) - scheduledRank(right) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function matchesBayBoardQuery(loadJob: LoadJob, query: string): boolean {
  if (!query) return true;
  return [
    loadJob.destinationRegion,
    loadJob.loadNo,
    loadJob.dockNo,
    loadJob.truckNo,
  ].some((value) => value?.toLocaleLowerCase().includes(query));
}

function scheduledRank(loadJob: LoadJob): number {
  const timestamp = loadJob.scheduledDepartureAt
    ? Date.parse(loadJob.scheduledDepartureAt)
    : Number.MAX_SAFE_INTEGER;
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function statusRank(loadJob: LoadJob): number {
  if (loadJob.status === "IN_PROGRESS") return 0;
  if (loadJob.status === "PLANNED") return 1;
  return 2;
}

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

export function formatNullable(value: string | null, fallback = "Not set"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function formatScheduledDeparture(value: string | null, locale?: string): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function loadJobStatusLabel(status: string, locale: "en" | "zh-CN"): string {
  const labels: Record<string, { en: string; "zh-CN": string }> = {
    COMPLETED: { en: "Completed", "zh-CN": "已完成" },
    IN_PROGRESS: { en: "In progress", "zh-CN": "进行中" },
    PLANNED: { en: "Planned", "zh-CN": "已计划" },
  };
  return labels[status]?.[locale] ?? status;
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
