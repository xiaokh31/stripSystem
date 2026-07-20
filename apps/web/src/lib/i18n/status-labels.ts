import { DEFAULT_LOCALE, type Locale, type MessageKey } from "./catalog";
import { createTranslator } from "./translator";

type LocalizedLabel = Record<Locale, string>;

export const PARSER_LEARNING_CASE_STATES = [
  "OPEN",
  "MAPPING",
  "READY_FOR_REPLAY",
  "REPLAY_FAILED",
  "AWAITING_COMPLETION",
  "AWAITING_APPROVAL",
  "CLOSED",
] as const;

export type ParserLearningCaseState =
  (typeof PARSER_LEARNING_CASE_STATES)[number];

const containerLifecycleStatusLabels: Record<string, LocalizedLabel> = {
  CORRECTED: { en: "Corrected", "zh-CN": "已修正" },
  ERROR: { en: "Error", "zh-CN": "错误" },
  IMPORTED: { en: "Imported", "zh-CN": "已导入" },
  LABELS_GENERATED: { en: "Labels generated", "zh-CN": "已生成面单" },
  LOADED: { en: "Delivered to destination", "zh-CN": "已送库" },
  LOADING_IN_PROGRESS: { en: "Loading in progress", "zh-CN": "装车中" },
  PARSED: { en: "Parsed", "zh-CN": "已解析" },
  REPORT_GENERATED: { en: "Report generated", "zh-CN": "已生成报告" },
  UNLOADED: { en: "Unloaded", "zh-CN": "已拆完" },
};

const containerLifecycleStatusAliases: Record<string, string> = {
  Corrected: "CORRECTED",
  Error: "ERROR",
  Imported: "IMPORTED",
  "Labels generated": "LABELS_GENERATED",
  "Delivered to destination": "LOADED",
  "Loading in progress": "LOADING_IN_PROGRESS",
  Parsed: "PARSED",
  "Report generated": "REPORT_GENERATED",
  Unloaded: "UNLOADED",
  已修正: "CORRECTED",
  错误: "ERROR",
  已导入: "IMPORTED",
  已生成面单: "LABELS_GENERATED",
  已送库: "LOADED",
  装车中: "LOADING_IN_PROGRESS",
  已解析: "PARSED",
  已生成报告: "REPORT_GENERATED",
  已拆完: "UNLOADED",
};

const palletStatusLabels: Record<string, LocalizedLabel> = {
  ADJUSTED_OUT: { en: "Adjusted out", "zh-CN": "已人工消库存" },
  CANCELLED: { en: "Cancelled", "zh-CN": "已取消" },
  EXCEPTION: { en: "Exception", "zh-CN": "异常" },
  LABEL_PRINTED: { en: "Label printed", "zh-CN": "已打印面单" },
  LOADED: { en: "Loaded", "zh-CN": "已装车" },
  LOADING: { en: "Loading", "zh-CN": "装车中" },
  PLANNED: { en: "Planned", "zh-CN": "计划中" },
};

const palletStatusAliases: Record<string, string> = {
  "Adjusted out": "ADJUSTED_OUT",
  Cancelled: "CANCELLED",
  Exception: "EXCEPTION",
  "Label printed": "LABEL_PRINTED",
  Loaded: "LOADED",
  Loading: "LOADING",
  Planned: "PLANNED",
  已人工消库存: "ADJUSTED_OUT",
  已取消: "CANCELLED",
  异常: "EXCEPTION",
  已打印面单: "LABEL_PRINTED",
  已装车: "LOADED",
  装车中: "LOADING",
  计划中: "PLANNED",
};

const palletEventTypeLabels: Record<string, LocalizedLabel> = {
  CANCELLED: { en: "Cancelled", "zh-CN": "已取消" },
  CREATED: { en: "Created", "zh-CN": "已创建" },
  DUPLICATE_SCAN: { en: "Duplicate scan", "zh-CN": "重复扫码" },
  INVALID_SCAN: { en: "Invalid scan", "zh-CN": "无效扫码" },
  LABEL_PRINTED: { en: "Label printed", "zh-CN": "已打印面单" },
  LOADED: { en: "Loaded", "zh-CN": "已装车" },
  MANUAL_INVENTORY_DEPLETION: {
    en: "Manual inventory depletion",
    "zh-CN": "人工消库存",
  },
  REPRINTED: { en: "Reprinted", "zh-CN": "已重打" },
  SCANNED: { en: "Scanned", "zh-CN": "已扫码" },
  STATUS_CHANGED: { en: "Status changed", "zh-CN": "状态已变更" },
};

const inventoryAdjustmentReasonLabels: Record<string, LocalizedLabel> = {
  DATA_CLEANUP: { en: "Data cleanup", "zh-CN": "数据清理" },
  DELIVERED_WITHOUT_SCAN: {
    en: "Delivered without scan",
    "zh-CN": "已送达但未扫码",
  },
  OTHER: { en: "Other", "zh-CN": "其他" },
  SCAN_MISSED: { en: "Scan missed", "zh-CN": "漏扫" },
};

const inventoryAdjustmentErrorLabels: Record<string, LocalizedLabel> = {
  INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING: {
    en: "Count exceeds remaining inventory",
    "zh-CN": "数量超过剩余库存",
  },
  INVENTORY_ADJUSTMENT_NO_ELIGIBLE_PALLETS: {
    en: "No eligible pallets",
    "zh-CN": "没有可消库存托盘",
  },
  INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE: {
    en: "Pallet is not eligible",
    "zh-CN": "托盘不可消库存",
  },
  INVENTORY_ADJUSTMENT_PERMISSION_DENIED: {
    en: "Permission denied",
    "zh-CN": "没有消库存权限",
  },
  INVENTORY_ADJUSTMENT_REASON_REQUIRED: {
    en: "Reason required",
    "zh-CN": "必须填写原因",
  },
  INVENTORY_ADJUSTMENT_TARGET_REQUIRED: {
    en: "Inventory adjustment target required",
    "zh-CN": "必须选择消库存目标",
  },
  PALLET_ADJUSTED_OUT: {
    en: "Pallet adjusted out",
    "zh-CN": "托盘已人工消库存",
  },
};

const loadJobStatusLabels: Record<string, LocalizedLabel> = {
  CANCELLED: { en: "Cancelled", "zh-CN": "已取消" },
  COMPLETED: { en: "Completed", "zh-CN": "已完成" },
  IN_PROGRESS: { en: "In progress", "zh-CN": "进行中" },
  PLANNED: { en: "Planned", "zh-CN": "计划中" },
};

const loadJobStatusAliases: Record<string, string> = {
  Cancelled: "CANCELLED",
  Completed: "COMPLETED",
  "In progress": "IN_PROGRESS",
  Planned: "PLANNED",
  已取消: "CANCELLED",
  已完成: "COMPLETED",
  进行中: "IN_PROGRESS",
  计划中: "PLANNED",
};

const unloadingWageCompletionStatusLabels: Record<string, LocalizedLabel> = {
  COMPLETED: { en: "Completed", "zh-CN": "已完成" },
  DRAFT: { en: "Draft", "zh-CN": "草稿" },
  NEEDS_REVIEW: { en: "Needs review", "zh-CN": "需复核" },
  SETTLED: { en: "Settled", "zh-CN": "已结算" },
  SUPERSEDED: { en: "Superseded", "zh-CN": "已被取代" },
};

const unloadingWageCompletionStatusAliases: Record<string, string> = {
  Completed: "COMPLETED",
  Draft: "DRAFT",
  "Needs review": "NEEDS_REVIEW",
  Settled: "SETTLED",
  Superseded: "SUPERSEDED",
  已完成: "COMPLETED",
  草稿: "DRAFT",
  需复核: "NEEDS_REVIEW",
  已结算: "SETTLED",
  已被取代: "SUPERSEDED",
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
  GENERATING: { en: "Generating", "zh-CN": "生成中" },
  GENERATED: { en: "Generated", "zh-CN": "已生成" },
  PARSED: { en: "Parsed", "zh-CN": "已解析" },
  PARSING: { en: "Parsing", "zh-CN": "解析中" },
  REVIEW_REQUIRED: { en: "Review required", "zh-CN": "需要人工复核" },
  UPLOADED: { en: "Uploaded", "zh-CN": "已上传" },
  WARNING: { en: "Warning", "zh-CN": "警告" },
};

const parserLearningCaseStatusLabels: Record<
  ParserLearningCaseState,
  LocalizedLabel
> = {
  OPEN: { en: "Open", "zh-CN": "待处理" },
  MAPPING: { en: "Mapping in progress", "zh-CN": "映射编辑中" },
  READY_FOR_REPLAY: { en: "Ready for replay", "zh-CN": "可执行回放" },
  REPLAY_FAILED: { en: "Replay needs attention", "zh-CN": "回放需要处理" },
  AWAITING_COMPLETION: {
    en: "Awaiting unloading completion",
    "zh-CN": "等待卸柜完成",
  },
  AWAITING_APPROVAL: { en: "Awaiting approval", "zh-CN": "等待批准" },
  CLOSED: { en: "Closed", "zh-CN": "已关闭" },
};

const parserProfileLifecycleLabels: Record<string, LocalizedLabel> = {
  ACTIVE: { en: "Active", "zh-CN": "已启用" },
  DRAFT: { en: "Draft", "zh-CN": "草稿" },
  PAUSED: { en: "Paused", "zh-CN": "已暂停" },
  RETIRED: { en: "Retired", "zh-CN": "已退役" },
};

const parserProfileTrustStateLabels: Record<string, LocalizedLabel> = {
  REVIEW_REQUIRED: { en: "Review required", "zh-CN": "需要人工复核" },
  TRUSTED: { en: "Trusted", "zh-CN": "已信任" },
};

const parserSourceKindLabels: Record<string, LocalizedLabel> = {
  BUILT_IN: { en: "Built-in parser", "zh-CN": "内置解析器" },
  MANUAL: { en: "Manual entry", "zh-CN": "人工录入" },
  PROFILE: { en: "Parser profile", "zh-CN": "解析配置" },
};

export const PARSER_PROFILE_CONTRACT_CODES = [
  "IMPORT_USED_BY_PARSER_LEARNING",
  "PARSER_LEARNING_CASE_ALREADY_LINKED",
  "PARSER_LEARNING_CASE_CLOSED",
  "PARSER_LEARNING_CASE_HAS_PROFILE_DEPENDENCY",
  "PARSER_LEARNING_CASE_LINK_CONFLICT",
  "PARSER_LEARNING_CASE_NOT_FOUND",
  "PARSER_LEARNING_CASE_REPLAY_RUNNING",
  "PARSER_LEARNING_CASE_START_CONFLICT",
  "PARSER_LEARNING_CONTAINER_ALREADY_LINKED",
  "PARSER_LEARNING_CONTAINER_NOT_FOUND",
  "PARSER_LEARNING_CONTAINER_NOT_MANUAL",
  "PARSER_LEARNING_IMPORT_NOT_FOUND",
  "PARSER_LEARNING_IMPORT_STATUS_NOT_ALLOWED",
  "PARSER_LEARNING_VALIDATION_FAILED",
  "PARSER_PROFILE_REQUEST_VALIDATION_FAILED",
  "PARSER_PROFILE_TRAIN_FORBIDDEN",
  "QUEUE_DISABLED",
  "QUEUE_ENQUEUE_FAILED",
  "QUEUE_UNAVAILABLE",
  "PROFILE_CANDIDATE_FAMILY_CONFLICT",
  "PROFILE_CANDIDATE_NOT_READY",
  "PROFILE_DEFINITION_JSON_INVALID",
  "PROFILE_DRAFT_NOT_FOUND",
  "PROFILE_DRAFT_REVISION_CONFLICT",
  "PROFILE_EVIDENCE_DETAIL_ROWS_UNVERIFIED",
  "PROFILE_EVIDENCE_REFERENCE_UNVERIFIED",
  "PROFILE_EVIDENCE_VOLUME_UNVERIFIED",
  "PROFILE_MAPPING_DEFINITION_INVALID",
  "PROFILE_MAPPING_REQUIRED_FIELD_MISSING",
  "PROFILE_PREVIEW_STALE_RESULT",
  "PROFILE_REPLAY_ARTIFACT_NOT_FOUND",
  "PROFILE_REPLAY_ARTIFACT_NOT_READY",
  "PROFILE_REPLAY_CARTONS_MISMATCH",
  "PROFILE_REPLAY_CONTAINER_MISMATCH",
  "PROFILE_REPLAY_DESTINATION_SET_MISMATCH",
  "PROFILE_REPLAY_DETAIL_ROWS_MISMATCH",
  "PROFILE_REPLAY_FIELD_MATCHED",
  "PROFILE_REPLAY_JOB_NOT_FOUND",
  "PROFILE_REPLAY_JOB_PAYLOAD_INVALID",
  "PROFILE_REPLAY_MANUAL_RESULT_REQUIRED",
  "PROFILE_REPLAY_MANUAL_SNAPSHOT_CHANGED",
  "PROFILE_REPLAY_NOT_READY",
  "PROFILE_REPLAY_PACKAGE_EVIDENCE_MISMATCH",
  "PROFILE_REPLAY_QUEUE_FAILED",
  "PROFILE_REPLAY_REFERENCE_EVIDENCE_MISMATCH",
  "PROFILE_REPLAY_STALE_REVISION",
  "PROFILE_REPLAY_VOLUME_MISMATCH",
  "PROFILE_REPLAY_WORKER_FAILED",
  "PROFILE_SOURCE_SHA_MISMATCH",
  "PROFILE_SOURCE_STORAGE_PATH_NOT_FILE",
  "PROFILE_SOURCE_WORKBOOK_NOT_FOUND",
  "PROFILE_STORAGE_FILE_NOT_FOUND",
  "PROFILE_STORAGE_PATH_INVALID",
  "PROFILE_STORAGE_PATH_OUTSIDE_ROOT",
  "PROFILE_WORKER_EMPTY_OUTPUT",
  "PROFILE_WORKER_INVALID_OUTPUT",
  "PROFILE_WORKER_INVOCATION_FAILED",
  "WORKBOOK_NOT_FOUND",
  "WORKBOOK_TYPE_UNSUPPORTED",
  "WORKBOOK_READ_FAILED",
  "WORKBOOK_ARCHIVE_ENTRY_LIMIT_EXCEEDED",
  "WORKBOOK_ARCHIVE_ENTRY_COUNT_LIMIT_EXCEEDED",
  "WORKBOOK_ARCHIVE_TOTAL_SIZE_LIMIT_EXCEEDED",
  "INSPECTION_SHEET_LIMIT_EXCEEDED",
  "INSPECTION_ROW_LIMIT_EXCEEDED",
  "INSPECTION_COLUMN_LIMIT_EXCEEDED",
  "INSPECTION_CELL_LIMIT_EXCEEDED",
  "INSPECTION_MERGED_RANGE_LIMIT_EXCEEDED",
  "FORMULA_CACHED_VALUE_MISSING",
  "FINGERPRINT_WORKBOOK_TYPE_MISMATCH",
  "FINGERPRINT_SHEET_MISSING",
  "FINGERPRINT_REQUIRED_ANCHOR_MISSING",
  "FINGERPRINT_ANCHOR_MATCHED",
  "FINGERPRINT_RELATIVE_COLUMN_MISMATCH",
  "FINGERPRINT_COLUMN_TYPE_MISMATCH",
  "FINGERPRINT_FORMULA_CACHE_MISSING",
  "FINGERPRINT_DATA_START_MISMATCH",
  "FINGERPRINT_DATA_STOP_MISMATCH",
  "FINGERPRINT_PROFILE_COLLISION",
  "FINGERPRINT_NO_MATCH",
  "FINGERPRINT_DEFINITION_UNKNOWN_FIELD",
  "FINGERPRINT_DEFINITION_INVALID",
  "FINGERPRINT_SHEET_SELECTOR_INVALID",
  "FINGERPRINT_VERSION_UNSUPPORTED",
  "MAPPING_DEFINITION_UNKNOWN_FIELD",
  "MAPPING_DEFINITION_INVALID",
  "MAPPING_OPERATION_UNKNOWN",
  "MAPPING_SOURCE_CELL_INVALID",
  "MAPPING_REGEX_UNSAFE",
  "MAPPING_REGEX_INVALID",
  "MAPPING_DIVISOR_ZERO",
  "MAPPING_CANONICAL_FIELD_UNKNOWN",
  "MAPPING_CONTAINER_CONSTANT_FORBIDDEN",
  "MAPPING_SHEET_SELECTOR_INVALID",
  "MAPPING_SHEET_NOT_FOUND",
  "MAPPING_SHEET_LIMIT_EXCEEDED",
  "MAPPING_HEADER_NOT_FOUND",
  "MAPPING_COLUMN_LIMIT_EXCEEDED",
  "MAPPING_ROW_BUDGET_EXCEEDED",
  "MAPPING_CELL_LIMIT_EXCEEDED",
  "MAPPING_SOURCE_COLUMN_NOT_FOUND",
  "MAPPING_TRANSFORM_FAILED",
  "MAPPING_ROW_LIMIT_EXCEEDED",
  "MAPPING_FORMULA_CACHE_MISSING",
  "MAPPING_REGEX_TIMEOUT",
  "MAPPING_REGEX_BUDGET_EXCEEDED",
  "MAPPING_REGEX_INPUT_LIMIT_EXCEEDED",
  "MAPPING_WORKBOOK_READ_FAILED",
  "MISSING_CONTAINER_NO",
  "MISSING_DESTINATION",
  "MISSING_CARTONS",
  "MISSING_VOLUME",
  "ZERO_VOLUME_WITH_CARTONS",
  "NEED_MANUAL_DESTINATION",
  "HEADER_ALIAS_MATCH",
] as const;

export type ParserProfileContractCode =
  (typeof PARSER_PROFILE_CONTRACT_CODES)[number];

const parserProfileContractCodeLabels = parserProfileCodeCatalog({
  IMPORT_USED_BY_PARSER_LEARNING: {
    en: "Import is used by parser learning",
    "zh-CN": "导入文件正用于解析学习",
  },
  PARSER_LEARNING_CASE_ALREADY_LINKED: {
    en: "Learning case already has a manual result",
    "zh-CN": "学习案例已有关联的人工结果",
  },
  PARSER_LEARNING_CASE_CLOSED: {
    en: "Learning case is closed",
    "zh-CN": "学习案例已关闭",
  },
  PARSER_LEARNING_CASE_LINK_CONFLICT: {
    en: "Learning case link changed concurrently",
    "zh-CN": "学习案例关联已被并发修改",
  },
  PARSER_LEARNING_CASE_HAS_PROFILE_DEPENDENCY: {
    en: "Learning case has protected profile history",
    "zh-CN": "学习案例已有受保护的解析配置历史",
  },
  PARSER_LEARNING_VALIDATION_FAILED: {
    en: "Parser learning request validation failed.",
    "zh-CN": "解析学习请求验证失败。",
  },
  PARSER_LEARNING_CASE_NOT_FOUND: {
    en: "Learning case not found",
    "zh-CN": "未找到学习案例",
  },
  PARSER_LEARNING_CASE_REPLAY_RUNNING: {
    en: "Another replay is already running for this case",
    "zh-CN": "此学习案例已有回放任务正在运行",
  },
  PARSER_LEARNING_CASE_START_CONFLICT: {
    en: "Learning case was created concurrently",
    "zh-CN": "学习案例已被并发创建",
  },
  PARSER_LEARNING_CONTAINER_ALREADY_LINKED: {
    en: "Manual result belongs to another learning case",
    "zh-CN": "人工结果已属于其他学习案例",
  },
  PARSER_LEARNING_CONTAINER_NOT_FOUND: {
    en: "Manual result not found",
    "zh-CN": "未找到人工结果",
  },
  PARSER_LEARNING_CONTAINER_NOT_MANUAL: {
    en: "Only a manual result can be linked",
    "zh-CN": "只能关联人工结果",
  },
  PARSER_LEARNING_IMPORT_NOT_FOUND: {
    en: "Source import not found",
    "zh-CN": "未找到来源导入",
  },
  PARSER_LEARNING_IMPORT_STATUS_NOT_ALLOWED: {
    en: "Import is not eligible for parser learning",
    "zh-CN": "该导入不可进入解析学习",
  },
  PARSER_PROFILE_TRAIN_FORBIDDEN: {
    en: "Parser training permission required",
    "zh-CN": "需要解析训练权限",
  },
  QUEUE_DISABLED: {
    en: "Background processing is disabled",
    "zh-CN": "后台处理当前已禁用",
  },
  QUEUE_ENQUEUE_FAILED: {
    en: "Replay could not be added to the processing queue",
    "zh-CN": "回放任务无法加入处理队列",
  },
  QUEUE_UNAVAILABLE: {
    en: "Background processing is temporarily unavailable",
    "zh-CN": "后台处理暂时不可用",
  },
  PROFILE_DRAFT_NOT_FOUND: {
    en: "No saved mapping draft exists for this case",
    "zh-CN": "此学习案例尚无已保存的映射草稿",
  },
  PROFILE_DRAFT_REVISION_CONFLICT: {
    en: "The mapping draft changed; reload before saving",
    "zh-CN": "映射草稿已变更，请重新加载后保存",
  },
  PROFILE_PREVIEW_STALE_RESULT: {
    en: "Preview was based on an older mapping revision",
    "zh-CN": "预览基于旧版映射，请重新执行",
  },
  PROFILE_REPLAY_ARTIFACT_NOT_FOUND: {
    en: "Replay evidence file was not found",
    "zh-CN": "未找到回放证据文件",
  },
  PROFILE_REPLAY_ARTIFACT_NOT_READY: {
    en: "Replay evidence is not ready",
    "zh-CN": "回放证据尚未就绪",
  },
  PROFILE_REPLAY_CARTONS_MISMATCH: {
    en: "Carton totals differ from the manual result",
    "zh-CN": "箱数合计与人工结果不一致",
  },
  PROFILE_REPLAY_CONTAINER_MISMATCH: {
    en: "Container number differs from the manual result",
    "zh-CN": "柜号与人工结果不一致",
  },
  PROFILE_REPLAY_DESTINATION_SET_MISMATCH: {
    en: "Destination set differs from the manual result",
    "zh-CN": "目的仓集合与人工结果不一致",
  },
  PROFILE_REPLAY_DETAIL_ROWS_MISMATCH: {
    en: "Included detail rows differ from the manual result",
    "zh-CN": "明细行范围与人工结果不一致",
  },
  PROFILE_REPLAY_FIELD_MATCHED: {
    en: "Replay field matches the manual result",
    "zh-CN": "回放字段与人工结果一致",
  },
  PROFILE_REPLAY_JOB_NOT_FOUND: {
    en: "Replay job was not found for this case",
    "zh-CN": "此学习案例未找到对应回放任务",
  },
  PROFILE_REPLAY_JOB_PAYLOAD_INVALID: {
    en: "Replay job data is invalid",
    "zh-CN": "回放任务数据无效",
  },
  PROFILE_REPLAY_MANUAL_RESULT_REQUIRED: {
    en: "A linked manual result is required for replay",
    "zh-CN": "回放前必须关联人工结果",
  },
  PROFILE_REPLAY_MANUAL_SNAPSHOT_CHANGED: {
    en: "The manual result changed during replay",
    "zh-CN": "回放期间人工结果已变更",
  },
  PROFILE_REPLAY_NOT_READY: {
    en: "Mapping or manual evidence is not ready for replay",
    "zh-CN": "映射或人工证据尚未达到回放条件",
  },
  PROFILE_REPLAY_PACKAGE_EVIDENCE_MISMATCH: {
    en: "Package evidence differs from the manual result",
    "zh-CN": "包装证据与人工结果不一致",
  },
  PROFILE_REPLAY_QUEUE_FAILED: {
    en: "Replay queue submission failed",
    "zh-CN": "回放任务提交失败",
  },
  PROFILE_REPLAY_REFERENCE_EVIDENCE_MISMATCH: {
    en: "Reference evidence differs from the manual result",
    "zh-CN": "参考证据与人工结果不一致",
  },
  PROFILE_REPLAY_STALE_REVISION: {
    en: "Replay used an older mapping revision",
    "zh-CN": "回放使用了旧版映射",
  },
  PROFILE_REPLAY_VOLUME_MISMATCH: {
    en: "Volume totals differ from the manual result",
    "zh-CN": "体积合计与人工结果不一致",
  },
  PROFILE_REPLAY_WORKER_FAILED: {
    en: "Replay processing failed",
    "zh-CN": "回放处理失败",
  },
  PROFILE_EVIDENCE_DETAIL_ROWS_UNVERIFIED: {
    en: "Manual detail-row evidence is unavailable",
    "zh-CN": "缺少可核验的人工明细行证据",
  },
  PROFILE_EVIDENCE_REFERENCE_UNVERIFIED: {
    en: "Manual reference evidence is unavailable",
    "zh-CN": "缺少可核验的人工参考证据",
  },
  PROFILE_EVIDENCE_VOLUME_UNVERIFIED: {
    en: "Manual volume evidence is missing or zero",
    "zh-CN": "人工体积证据缺失或为零",
  },
});

function parserProfileCodeCatalog(
  overrides: Partial<Record<ParserProfileContractCode, LocalizedLabel>>,
): Record<ParserProfileContractCode, LocalizedLabel> {
  return Object.fromEntries(
    PARSER_PROFILE_CONTRACT_CODES.map((code) => [
      code,
      overrides[code] ?? genericParserProfileCodeLabel(code),
    ]),
  ) as Record<ParserProfileContractCode, LocalizedLabel>;
}

function genericParserProfileCodeLabel(
  code: ParserProfileContractCode,
): LocalizedLabel {
  if (code.startsWith("FINGERPRINT_")) {
    return {
      en: "Workbook structure fingerprint issue",
      "zh-CN": "工作簿结构指纹需要处理",
    };
  }
  if (code.startsWith("MAPPING_") || code.startsWith("PROFILE_MAPPING_")) {
    return { en: "Mapping definition issue", "zh-CN": "映射定义需要处理" };
  }
  if (
    code.startsWith("PROFILE_REPLAY_") ||
    code.startsWith("PROFILE_EVIDENCE_")
  ) {
    return { en: "Replay comparison result", "zh-CN": "回放比对结果" };
  }
  if (code.startsWith("INSPECTION_")) {
    return {
      en: "Workbook inspection limit reached",
      "zh-CN": "工作簿检查达到限制",
    };
  }
  if (code.startsWith("WORKBOOK_") || code.startsWith("FORMULA_")) {
    return { en: "Workbook processing issue", "zh-CN": "工作簿处理需要处理" };
  }
  if (
    code.startsWith("MISSING_") ||
    code === "ZERO_VOLUME_WITH_CARTONS" ||
    code === "NEED_MANUAL_DESTINATION" ||
    code === "HEADER_ALIAS_MATCH"
  ) {
    return { en: "Source data validation result", "zh-CN": "来源数据验证结果" };
  }
  if (
    code.startsWith("PROFILE_STORAGE_") ||
    code.startsWith("PROFILE_SOURCE_")
  ) {
    return { en: "Source file access issue", "zh-CN": "来源文件访问需要处理" };
  }
  if (code.startsWith("PROFILE_WORKER_")) {
    return { en: "Parser worker issue", "zh-CN": "解析工作进程需要处理" };
  }
  return {
    en: "Parser profile request issue",
    "zh-CN": "解析配置请求需要处理",
  };
}

const generatedAndImportStatusAliases: Record<string, string> = {
  Failed: "FAILED",
  Generated: "GENERATED",
  Parsed: "PARSED",
  Parsing: "PARSING",
  Uploaded: "UPLOADED",
  Warning: "WARNING",
  失败: "FAILED",
  已生成: "GENERATED",
  已解析: "PARSED",
  解析中: "PARSING",
  已上传: "UPLOADED",
  警告: "WARNING",
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

const roleLabels: Record<string, LocalizedLabel> = {
  ADMIN: { en: "Administrator", "zh-CN": "管理员" },
  HR_MANAGER: { en: "Human Resources Manager", "zh-CN": "人力资源经理" },
  OFFICE: { en: "Office Staff", "zh-CN": "办公室员工" },
  SYSTEM: { en: "System Service", "zh-CN": "系统服务" },
  WAREHOUSE: { en: "Warehouse Staff", "zh-CN": "仓库员工" },
  WAREHOUSE_MANAGER: { en: "Warehouse Manager", "zh-CN": "仓库经理" },
};

const healthStatusLabels: Record<string, LocalizedLabel> = {
  degraded: { en: "Degraded", "zh-CN": "降级" },
  down: { en: "Down", "zh-CN": "离线" },
  ok: { en: "OK", "zh-CN": "正常" },
  unknown: { en: "Unknown", "zh-CN": "未知" },
  up: { en: "Up", "zh-CN": "在线" },
};

const destinationTypeKeys: Record<string, MessageKey> = {
  AMAZON_FBA: "i18n.destinationType.amazonFba",
  COURIER: "i18n.destinationType.courier",
  PARCEL_COMMERCIAL: "i18n.destinationType.parcelCommercial",
  PARCEL_PRIVATE: "i18n.destinationType.parcelPrivate",
  TRANSFER: "i18n.destinationType.transfer",
  UNKNOWN: "i18n.destinationType.unknown",
  UNSPECIFIED: "i18n.destinationType.unknown",
  WAREHOUSE: "i18n.destinationType.warehouse",
};

const generatedFileTypeKeys: Record<string, MessageKey> = {
  ATTENDANCE_PARSED_JSON: "i18n.generatedFile.attendanceParsed",
  EXCEL_REPORT: "Excel report",
  MONTHLY_UNLOADING_SUMMARY_XLSX: "Monthly unloading summary",
  PALLET_LABEL_PDF: "Label PDF",
  PARSER_PROFILE_REPLAY_JSON: "Parser profile replay JSON",
  TASK_REPORT_HTML: "Task report",
  UNLOADING_WAGE_SETTLEMENT_JSON: "Settlement JSON",
  UNLOADING_WAGE_SETTLEMENT_XLSX: "Unloading wage settlement",
  UNLOADING_WAGE_TASK_REPORT_HTML: "HTML task report",
  WAGE_RECORD_XLS: "Wage record",
  WAGE_RECORD_XLSX: "Wage record",
};

export function containerLifecycleStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(
    containerLifecycleStatusLabels,
    status,
    locale,
    containerLifecycleStatusAliases,
  );
}

export function palletStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(palletStatusLabels, status, locale, palletStatusAliases);
}

export function palletEventTypeLabel(
  eventType: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(palletEventTypeLabels, eventType, locale);
}

export function inventoryAdjustmentReasonLabel(
  reasonCode: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(inventoryAdjustmentReasonLabels, reasonCode, locale);
}

export function inventoryAdjustmentErrorLabel(
  errorCode: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(inventoryAdjustmentErrorLabels, errorCode, locale);
}

export function loadJobStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(loadJobStatusLabels, status, locale, loadJobStatusAliases);
}

export function unloadingWageCompletionStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(
    unloadingWageCompletionStatusLabels,
    status,
    locale,
    unloadingWageCompletionStatusAliases,
  );
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
  return labelFrom(
    generatedAndImportStatusLabels,
    status,
    locale,
    generatedAndImportStatusAliases,
  );
}

export function parserLearningCaseStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(parserLearningCaseStatusLabels, status, locale);
}

export function parserProfileLifecycleLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(parserProfileLifecycleLabels, status, locale);
}

export function parserProfileTrustStateLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(parserProfileTrustStateLabels, status, locale);
}

export function parserSourceKindLabel(
  sourceKind: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(parserSourceKindLabels, sourceKind, locale);
}

export function parserProfileContractCodeLabel(
  code: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(parserProfileContractCodeLabels, code, locale);
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

export function roleDisplayLabel(
  roleCode: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(roleLabels, roleCode, locale);
}

export function destinationTypeLabel(
  destinationType: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const normalized = destinationType?.trim().toUpperCase();
  const { format, t } = createTranslator(locale);

  if (!normalized) {
    return t("No type");
  }

  const key = destinationTypeKeys[normalized];
  return key
    ? t(key)
    : format("i18n.destinationType.other", {
        value: destinationType?.trim() ?? "",
      });
}

export function generatedFileTypeLabel(
  fileType: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);
  return t(generatedFileTypeKeys[fileType?.trim() ?? ""] ?? "Generated file");
}

export function healthStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return labelFrom(healthStatusLabels, status, locale);
}

export function businessStatusLabel(
  status: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return (
    lookup(
      containerLifecycleStatusLabels,
      status,
      locale,
      containerLifecycleStatusAliases,
    ) ??
    lookup(palletStatusLabels, status, locale, palletStatusAliases) ??
    lookup(palletEventTypeLabels, status, locale) ??
    lookup(inventoryAdjustmentReasonLabels, status, locale) ??
    lookup(inventoryAdjustmentErrorLabels, status, locale) ??
    lookup(loadJobStatusLabels, status, locale, loadJobStatusAliases) ??
    lookup(
      unloadingWageCompletionStatusLabels,
      status,
      locale,
      unloadingWageCompletionStatusAliases,
    ) ??
    lookup(
      generatedAndImportStatusLabels,
      status,
      locale,
      generatedAndImportStatusAliases,
    ) ??
    lookup(parserLearningCaseStatusLabels, status, locale) ??
    lookup(parserProfileLifecycleLabels, status, locale) ??
    lookup(parserProfileTrustStateLabels, status, locale) ??
    lookup(parserSourceKindLabels, status, locale) ??
    lookup(parserProfileContractCodeLabels, status, locale) ??
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
  aliases: Record<string, string> = {},
): string {
  return (
    lookup(labels, status, locale, aliases) ?? humanizeStatus(status, locale)
  );
}

function lookup(
  labels: Record<string, LocalizedLabel>,
  status: string | null | undefined,
  locale: Locale,
  aliases: Record<string, string> = {},
): string | null {
  const key = status?.trim();
  if (!key) {
    return null;
  }
  return labels[key]?.[locale] ?? labels[aliases[key] ?? ""]?.[locale] ?? null;
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
