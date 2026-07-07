import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTAINER_STATUS_UPDATE_VALUES,
  LOADED_SCAN_ONLY_NOTICE,
  containerStatusSelectLabel,
  isContainerStatusOptionDisabled,
  isContainerStatusScanOnly,
} from "../src/components/containers/container-status-flow";

test("container status update options keep loaded visible but scan-only", () => {
  assert.deepEqual(
    CONTAINER_STATUS_UPDATE_VALUES.filter((status) =>
      ["UNLOADED", "LOADING_IN_PROGRESS", "LOADED"].includes(status),
    ),
    ["UNLOADED", "LOADING_IN_PROGRESS", "LOADED"],
  );

  assert.equal(containerStatusSelectLabel("UNLOADED"), "Unloaded");
  assert.equal(
    containerStatusSelectLabel("LOADING_IN_PROGRESS"),
    "Loading in progress",
  );
  assert.equal(containerStatusSelectLabel("LOADED"), "Delivered to destination");
  assert.equal(containerStatusSelectLabel("UNLOADED", "zh-CN"), "已拆完");
  assert.equal(
    containerStatusSelectLabel("LOADING_IN_PROGRESS", "zh-CN"),
    "装车中",
  );
  assert.equal(containerStatusSelectLabel("LOADED", "zh-CN"), "已送库");
  assert.equal(isContainerStatusScanOnly("LOADED"), true);
  assert.equal(isContainerStatusScanOnly("UNLOADED"), false);
  assert.equal(isContainerStatusOptionDisabled("LOADED", "UNLOADED"), true);
  assert.equal(isContainerStatusOptionDisabled("LOADED", "LOADED"), false);
  assert.match(LOADED_SCAN_ONLY_NOTICE, /loading scans/);
});
