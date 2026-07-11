import test from "node:test";
import assert from "node:assert/strict";
import {
  businessStatusLabel,
  containerLifecycleStatusLabel,
  generatedOrImportStatusLabel,
  healthStatusLabel,
  inventoryAdjustmentErrorLabel,
  inventoryAdjustmentReasonLabel,
  loadJobStatusLabel,
  offlineQueueStatusLabel,
  palletEventTypeLabel,
  palletStatusLabel,
  payClassificationLabel,
  roleDisplayLabel,
  scanResultLabel,
  unloadingWageCompletionStatusLabel,
  uploadQueueStatusLabel,
} from "../src/lib/i18n/status-labels";

test("container lifecycle statuses are locale aware and keep loaded separate", () => {
  assert.deepEqual(
    [
      "IMPORTED",
      "PARSED",
      "CORRECTED",
      "REPORT_GENERATED",
      "LABELS_GENERATED",
      "UNLOADED",
      "LOADING_IN_PROGRESS",
      "LOADED",
      "ERROR",
    ].map((status) => containerLifecycleStatusLabel(status, "en")),
    [
      "Imported",
      "Parsed",
      "Corrected",
      "Report generated",
      "Labels generated",
      "Unloaded",
      "Loading in progress",
      "Delivered to destination",
      "Error",
    ],
  );

  assert.equal(containerLifecycleStatusLabel("UNLOADED", "zh-CN"), "已拆完");
  assert.equal(
    containerLifecycleStatusLabel("LOADING_IN_PROGRESS", "zh-CN"),
    "装车中",
  );
  assert.equal(containerLifecycleStatusLabel("LOADED", "zh-CN"), "已送库");
});

test("pallet loaded and load job status labels do not reuse container loaded copy", () => {
  assert.equal(palletStatusLabel("LOADED", "en"), "Loaded");
  assert.equal(palletStatusLabel("LOADED", "zh-CN"), "已装车");
  assert.equal(palletStatusLabel("ADJUSTED_OUT", "en"), "Adjusted out");
  assert.equal(palletStatusLabel("ADJUSTED_OUT", "zh-CN"), "已人工消库存");
  assert.equal(loadJobStatusLabel("IN_PROGRESS", "en"), "In progress");
  assert.equal(loadJobStatusLabel("IN_PROGRESS", "zh-CN"), "进行中");
});

test("inventory adjustment event, reason, and error codes are locale aware", () => {
  assert.equal(
    palletEventTypeLabel("MANUAL_INVENTORY_DEPLETION", "en"),
    "Manual inventory depletion",
  );
  assert.equal(
    palletEventTypeLabel("MANUAL_INVENTORY_DEPLETION", "zh-CN"),
    "人工消库存",
  );
  assert.equal(
    inventoryAdjustmentReasonLabel("DELIVERED_WITHOUT_SCAN", "en"),
    "Delivered without scan",
  );
  assert.equal(
    inventoryAdjustmentReasonLabel("DELIVERED_WITHOUT_SCAN", "zh-CN"),
    "已送达但未扫码",
  );
  assert.equal(
    inventoryAdjustmentErrorLabel(
      "INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING",
      "en",
    ),
    "Count exceeds remaining inventory",
  );
  assert.equal(
    inventoryAdjustmentErrorLabel("PALLET_ADJUSTED_OUT", "zh-CN"),
    "托盘已人工消库存",
  );
});

test("wage, classification, generated, upload, and queue statuses are mapped", () => {
  assert.equal(
    unloadingWageCompletionStatusLabel("NEEDS_REVIEW", "en"),
    "Needs review",
  );
  assert.equal(
    unloadingWageCompletionStatusLabel("NEEDS_REVIEW", "zh-CN"),
    "需复核",
  );
  assert.equal(
    payClassificationLabel("US_TO_CANADA_TRANSFER", "en"),
    "US-to-Canada transfer",
  );
  assert.equal(
    payClassificationLabel("US_TO_CANADA_TRANSFER", "zh-CN"),
    "美转加",
  );
  assert.equal(generatedOrImportStatusLabel("PARSING", "zh-CN"), "解析中");
  assert.equal(uploadQueueStatusLabel("duplicate", "en"), "Duplicate");
  assert.equal(uploadQueueStatusLabel("invalid", "zh-CN"), "无效");
  assert.equal(offlineQueueStatusLabel("pending", "zh-CN"), "待同步");
  assert.equal(offlineQueueStatusLabel("synced", "en"), "Synced");
  assert.equal(scanResultLabel("DUPLICATE", "zh-CN"), "重复");
});

test("generic business status label prefers container lifecycle for container statuses", () => {
  assert.equal(businessStatusLabel("LOADED", "en"), "Delivered to destination");
  assert.equal(businessStatusLabel("LOADED", "zh-CN"), "已送库");
  assert.equal(businessStatusLabel("GENERATED", "zh-CN"), "已生成");
});

test("shell role and health labels are locale aware", () => {
  assert.equal(roleDisplayLabel("ADMIN", "en"), "Administrator");
  assert.equal(roleDisplayLabel("ADMIN", "zh-CN"), "管理员");
  assert.equal(roleDisplayLabel("WAREHOUSE_MANAGER", "en"), "Warehouse Manager");
  assert.equal(roleDisplayLabel("WAREHOUSE_MANAGER", "zh-CN"), "仓库经理");
  assert.equal(healthStatusLabel("ok", "en"), "OK");
  assert.equal(healthStatusLabel("ok", "zh-CN"), "正常");
  assert.equal(healthStatusLabel("down", "zh-CN"), "离线");
});
