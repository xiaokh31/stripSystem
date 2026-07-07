import { DEFAULT_LOCALE, type Locale } from "./catalog";

type LocalizedLabel = Record<Locale, string>;

const containerLifecycleStatusLabels: Record<string, LocalizedLabel> = {
  CORRECTED: { en: "Corrected", "zh-CN": "已修正" },
  ERROR: { en: "Error", "zh-CN": "错误" },
  IMPORTED: { en: "Imported", "zh-CN": "已导入" },
  LABELS_GENERATED: { en: "Labels generated", "zh-CN": "已生成面单" },
  LOADED: { en: "Delivered to warehouse", "zh-CN": "已送库" },
  LOADING_IN_PROGRESS: { en: "Loading in progress", "zh-CN": "装车中" },
  PARSED: { en: "Parsed", "zh-CN": "已解析" },
  REPORT_GENERATED: { en: "Report generated", "zh-CN": "已生成报告" },
  UNLOADED: { en: "Unloaded", "zh-CN": "已拆完" },
};

const palletStatusLabels: Record<string, LocalizedLabel> = {
  CANCELLED: { en: "Cancelled", "zh-CN": "已取消" },
  EXCEPTION: { en: "Exception", "zh-CN": "异常" },
  LABEL_PRINTED: { en: "Label printed", "zh-CN": "已打印面单" },
  LOADED: { en: "Loaded", "zh-CN": "已装车" },
  LOADING: { en: "Loading", "zh-CN": "装车中" },
  PLANNED: { en: "Planned", "zh-CN": "计划中" },
};

const loadJobStatusLabels: Record<string, LocalizedLabel> = {
  CANCELLED: { en: "Cancelled", "zh-CN": "已取消" },
  COMPLETED: { en: "Completed", "zh-CN": "已完成" },
  IN_PROGRESS: { en: "In progress", "zh-CN": "进行中" },
  PLANNED: { en: "Planned", "zh-CN": "计划中" },
};

const unloadingWageCompletionStatusLabels: Record<string, LocalizedLabel> = {
  COMPLETED: { en: "Completed", "zh-CN": "已完成" },
  DRAFT: { en: "Draft", "zh-CN": "草稿" },
  NEEDS_REVIEW: { en: "Needs review", "zh-CN": "需复核" },
  SETTLED: { en: "Settled", "zh-CN": "已结算" },
  SUPERSEDED: { en: "Superseded", "zh-CN": "已被取代" },
};

const unloadingWageCompletionDescriptions: Record<string, LocalizedLabel> = {
  COMPLETED: {
    en: "Unloading complete, ready for settlement",
    "zh-CN": "已拆完，可进入月结",
  },
  DRAFT: {
    en: "Not completed, excluded from settlement",
    "zh-CN": "未拆完，不会进入月结",
  },
  NEEDS_REVIEW: {
    en: "Unloading complete, review before settlement",
    "zh-CN": "已拆完，需复核后进入月结",
  },
  SETTLED: { en: "Settled", "zh-CN": "已结算" },
  SUPERSEDED: { en: "Superseded", "zh-CN": "已被取代" },
};

const payClassificationLabels: Record<string, LocalizedLabel> = {
  OCEAN_CONTAINER: { en: "Ocean container", "zh-CN": "海柜" },
  US_TO_CANADA_TRANSFER: { en: "US-to-Canada transfer", "zh-CN": "美转加" },
};

const generatedAndImportStatusLabels: Record<string, LocalizedLabel> = {
  FAILED: { en: "Failed", "zh-CN": "失败" },
  GENERATED: { en: "Generated", "zh-CN": "已生成" },
  PARSED: { en: "Parsed", "zh-CN": "已解析" },
  PARSING: { en: "Parsing", "zh-CN": "解析中" },
  UPLOADED: { en: "Uploaded", "zh-CN": "已上传" },
  WARNING: { en: "Warning", "zh-CN": "警告" },
};

const uploadQueueStatusLabels: Record<string, LocalizedLabel> = {
  duplicate: { en: "Duplicate", "zh-CN": "重复" },
  error: { en: "Error", "zh-CN": "错误" },
  invalid: { en: "Invalid", "zh-CN": "无效" },
  queued: { en: "Ready", "zh-CN": "准备上传" },
  success: { en: "Success", "zh-CN": "成功" },
  uploading: { en: "Uploading", "zh-CN": "上传中" },
};

const offlineQueueStatusLabels: Record<string, LocalizedLabel> = {
  failed: { en: "Failed", "zh-CN": "同步失败" },
  pending: { en: "Pending", "zh-CN": "待同步" },
  synced: { en: "Synced", "zh-CN": "已同步" },
};

const scanResultLabels: Record<string, LocalizedLabel> = {
  DUPLICATE: { en: "Duplicate", "zh-CN": "重复" },
  INVALID: { en: "Invalid", "zh-CN": "无效" },
  LOADED: { en: "Loaded", "zh-CN": "已装车" },
  REMOVED: { en: "Removed", "zh-CN": "已移除" },
  SUCCESS: { en: "Success", "zh-CN": "成功" },
};

export function containerLifecycleStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(containerLifecycleStatusLabels, status, locale);
}

export function palletStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(palletStatusLabels, status, locale);
}

export function loadJobStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(loadJobStatusLabels, status, locale);
}

export function unloadingWageCompletionStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(unloadingWageCompletionStatusLabels, status, locale);
}

export function unloadingWageCompletionDescription(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(
    unloadingWageCompletionDescriptions,
    status ?? "DRAFT",
    locale,
  );
}

export function payClassificationLabel(
  classification: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!classification) {
    return locale === "zh-CN" ? "未选择" : "Not selected";
  }
  return labelFrom(payClassificationLabels, classification, locale);
}

export function generatedOrImportStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(generatedAndImportStatusLabels, status, locale);
}

export function uploadQueueStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(uploadQueueStatusLabels, status, locale);
}

export function offlineQueueStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(offlineQueueStatusLabels, status, locale);
}

export function scanResultLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(scanResultLabels, status, locale);
}

export function businessStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return (
    lookup(containerLifecycleStatusLabels, status, locale) ??
    lookup(palletStatusLabels, status, locale) ??
    lookup(loadJobStatusLabels, status, locale) ??
    lookup(unloadingWageCompletionStatusLabels, status, locale) ??
    lookup(generatedAndImportStatusLabels, status, locale) ??
    lookup(uploadQueueStatusLabels, status, locale) ??
    lookup(offlineQueueStatusLabels, status, locale) ??
    humanizeStatus(status, locale)
  );
}

export function rawStatusTitle(status: string | null | undefined): string {
  return status?.trim() || "-";
}

function labelFrom(
  labels: Record<string, LocalizedLabel>,
  status: string | null | undefined,
  locale: Locale,
): string {
  return lookup(labels, status, locale) ?? humanizeStatus(status, locale);
}

function lookup(
  labels: Record<string, LocalizedLabel>,
  status: string | null | undefined,
  locale: Locale,
): string | null {
  const key = status?.trim();
  if (!key) {
    return null;
  }
  return labels[key]?.[locale] ?? null;
}

function humanizeStatus(
  status: string | null | undefined,
  locale: Locale,
): string {
  const value = status?.trim();
  if (!value) {
    return "-";
  }

  if (locale === "zh-CN") {
    return value;
  }

  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
