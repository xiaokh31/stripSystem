import type { ContainerResponse } from "@/lib/api-client";

export type StatusTone = "amber" | "emerald" | "red" | "zinc";

export interface ParseResultSummaryData {
  containers: Array<Pick<ContainerResponse, "id" | "containerNo">>;
}

export interface ContainerLink {
  href: string;
  label: string;
}

export function statusTone(status: string): StatusTone {
  if (status === "PARSED" || status === "WARNING") {
    return "emerald";
  }

  if (status === "ERROR") {
    return "red";
  }

  if (status === "PARSING") {
    return "amber";
  }

  return "zinc";
}

export function canTriggerParse(parseStatus: string): boolean {
  return parseStatus !== "PARSING";
}

export function containerLinks(
  containers: readonly Pick<ContainerResponse, "id" | "containerNo">[],
): ContainerLink[] {
  return containers.map((container) => ({
    href: `/containers/${container.id}`,
    label: container.containerNo,
  }));
}

export function toParseResultSummary(
  result: { containers: Array<Pick<ContainerResponse, "id" | "containerNo">> } | null,
): ParseResultSummaryData | null {
  if (!result) {
    return null;
  }

  return {
    containers: result.containers.map((container) => ({
      id: container.id,
      containerNo: container.containerNo,
    })),
  };
}

export function issueList(issues: unknown): string[] {
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues.map((issue, index) => issueText(issue, index));
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function issueText(issue: unknown, index: number): string {
  if (isRecord(issue)) {
    const message =
      typeof issue.message === "string"
        ? issue.message
        : JSON.stringify(issue);
    return message;
  }

  if (typeof issue === "string") {
    return issue;
  }

  return `Issue ${index + 1}: ${JSON.stringify(issue)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
