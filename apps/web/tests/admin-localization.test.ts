import assert from "node:assert/strict";
import test from "node:test";
import {
  permissionCategoryLabel,
  permissionDescriptionLabel,
} from "../src/lib/i18n/admin-labels";
import {
  operationalSettingCategoryLabel,
  operationalSettingFieldDescription,
  operationalSettingFieldLabel,
  operationalSettingOptionLabel,
} from "../src/lib/i18n/operational-settings-labels";

test("admin permission labels derive from stable category and permission codes", () => {
  assert.equal(permissionCategoryLabel("unloading_wage", "en"), "unloading wage records");
  assert.equal(permissionCategoryLabel("unloading_wage", "zh-CN"), "卸柜工资记录");
  assert.equal(
    permissionDescriptionLabel("unloading_wage.settle", "en"),
    "Settle unloading wage records.",
  );
  assert.equal(
    permissionDescriptionLabel("scan.create", "zh-CN"),
    "扫码托盘。",
  );
  assert.equal(
    permissionDescriptionLabel("legacy.unknown", "zh-CN"),
    "权限说明不可用。",
  );
});

test("operational settings labels derive from stable field keys and option values", () => {
  assert.equal(
    operationalSettingCategoryLabel("Operational profile", "zh-CN"),
    "运营配置",
  );
  assert.equal(operationalSettingFieldLabel("siteName", "zh-CN"), "站点名称");
  assert.equal(
    operationalSettingFieldDescription("siteName", "zh-CN"),
    "显示给办公室和仓库用户的名称。",
  );
  assert.equal(
    operationalSettingOptionLabel(
      "manualCorrectionPolicy",
      "audit_required",
      "zh-CN",
    ),
    "必须审计",
  );
  assert.equal(
    operationalSettingFieldLabel("unknownSetting", "zh-CN"),
    "设置 unknownSetting",
  );
});
