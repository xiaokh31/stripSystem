import type { Locale } from "../../lib/i18n/catalog";
import { businessStatusLabel } from "../../lib/i18n/status-labels";

export interface StatusStyle {
  label: string;
  styles: string;
}

export function statusStyle(status: string, locale?: Locale): StatusStyle {
  const normalized = status.toUpperCase();
  if (
    normalized === "GENERATED" ||
    normalized === "COMPLETED" ||
    normalized === "UPLOADED" ||
    normalized === "PARSED"
  ) {
    return {
      label: businessStatusLabel(status, locale),
      styles: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (
    normalized === "WARNING" ||
    normalized === "NEEDS_REVIEW" ||
    normalized === "DRAFT" ||
    normalized === "NOT_PARSED"
  ) {
    return {
      label: businessStatusLabel(status, locale),
      styles: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (
    normalized === "ERROR" ||
    normalized === "FAILED" ||
    normalized === "CANCELLED"
  ) {
    return {
      label: businessStatusLabel(status, locale),
      styles: "border-red-200 bg-red-50 text-red-800",
    };
  }
  if (normalized === "SETTLED" || normalized === "SUPERSEDED") {
    return {
      label: businessStatusLabel(status, locale),
      styles: "border-zinc-300 bg-zinc-100 text-zinc-800",
    };
  }
  return {
    label: businessStatusLabel(status, locale),
    styles: "border-zinc-200 bg-zinc-50 text-zinc-700",
  };
}

export function issueList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return typeof record.message === "string"
        ? record.message
        : JSON.stringify(record);
    }

    return String(item);
  });
}

export function formatMoney(amount: string | number, currency = "CAD"): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return `${currency} ${String(amount)}`;
  }

  return `${currency} ${parsed.toFixed(2)}`;
}

export function formatDateOnly(value: string | null): string {
  if (!value) {
    return "-";
  }
  return value.slice(0, 10);
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatUnknownList(input: unknown): string {
  if (Array.isArray(input)) {
    return input.map((item) => String(item)).join(", ");
  }
  if (typeof input === "string") {
    return input;
  }
  if (input === null || input === undefined) {
    return "-";
  }
  return JSON.stringify(input);
}
