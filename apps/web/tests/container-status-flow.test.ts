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

  assert.equal(containerStatusSelectLabel("UNLOADED"), "已拆完 (UNLOADED)");
  assert.equal(
    containerStatusSelectLabel("LOADING_IN_PROGRESS"),
    "装车中 (LOADING_IN_PROGRESS)",
  );
  assert.equal(containerStatusSelectLabel("LOADED"), "已送库 (LOADED)");
  assert.equal(isContainerStatusScanOnly("LOADED"), true);
  assert.equal(isContainerStatusScanOnly("UNLOADED"), false);
  assert.equal(isContainerStatusOptionDisabled("LOADED", "UNLOADED"), true);
  assert.equal(isContainerStatusOptionDisabled("LOADED", "LOADED"), false);
  assert.match(LOADED_SCAN_ONLY_NOTICE, /loading scans/);
});
