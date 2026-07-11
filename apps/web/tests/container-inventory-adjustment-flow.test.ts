import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManualInventoryDepletionRequest,
  emptyManualInventoryDepletionDraft,
  inventoryAdjustmentReasonOptions,
  manualInventoryAdjustmentErrorMessage,
} from "../src/components/containers/container-inventory-adjustment-flow";

test("manual inventory depletion request uses API count, reason, and trimmed note", () => {
  const result = buildManualInventoryDepletionRequest(
    {
      ...emptyManualInventoryDepletionDraft(),
      count: "2",
      note: "  Delivered to destination before scanning.  ",
      reasonCode: "DELIVERED_WITHOUT_SCAN",
    },
    3,
  );

  assert.deepEqual(result, {
    ok: true,
    payload: {
      count: 2,
      note: "Delivered to destination before scanning.",
      reasonCode: "DELIVERED_WITHOUT_SCAN",
    },
  });
});

test("manual inventory depletion validates count, reason, and OTHER note", () => {
  assert.deepEqual(
    buildManualInventoryDepletionRequest(
      {
        ...emptyManualInventoryDepletionDraft(),
        count: "0",
        reasonCode: "DATA_CLEANUP",
      },
      2,
    ),
    {
      error: "Enter a whole number from 1 to the current remaining inventory.",
      ok: false,
    },
  );
  assert.deepEqual(
    buildManualInventoryDepletionRequest(
      { ...emptyManualInventoryDepletionDraft(), count: "1" },
      2,
    ),
    {
      error: "Select a reason for manual inventory depletion.",
      ok: false,
    },
  );
  assert.deepEqual(
    buildManualInventoryDepletionRequest(
      {
        ...emptyManualInventoryDepletionDraft(),
        count: "1",
        note: " ",
        reasonCode: "OTHER",
      },
      2,
    ),
    {
      error: "A note is required when Other is selected.",
      ok: false,
    },
  );
});

test("manual inventory depletion maps stable errors and reasons into the active locale", () => {
  assert.equal(
    manualInventoryAdjustmentErrorMessage(
      "INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING",
      "zh-CN",
    ),
    "数量超过剩余库存",
  );
  assert.equal(
    manualInventoryAdjustmentErrorMessage("HTTP_409", "zh-CN"),
    "无法保存人工消库存，请刷新目的仓库存后重试。",
  );
  assert.deepEqual(inventoryAdjustmentReasonOptions("zh-CN"), [
    { label: "已送达但未扫码", value: "DELIVERED_WITHOUT_SCAN" },
    { label: "漏扫", value: "SCAN_MISSED" },
    { label: "数据清理", value: "DATA_CLEANUP" },
    { label: "其他", value: "OTHER" },
  ]);
});
