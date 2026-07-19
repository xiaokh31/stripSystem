import test from "node:test";
import assert from "node:assert/strict";
import type { AuthUserResponse } from "../src/lib/api-client";
import {
  canApproveParserProfiles,
  canReadParserProfiles,
  canReviewParserProfiles,
  canTrainParserProfiles,
} from "../src/lib/permissions";
import {
  generatedOrImportStatusLabel,
  parserLearningCaseStatusLabel,
  parserProfileContractCodeLabel,
  parserProfileLifecycleLabel,
  parserProfileTrustStateLabel,
  parserSourceKindLabel,
} from "../src/lib/i18n/status-labels";
import {
  permissionCategoryLabel,
  permissionDescriptionLabel,
} from "../src/lib/i18n/admin-labels";

test("parser-profile stable enums and codes have separate English and Chinese labels", () => {
  const contracts: Array<[string, string]> = [
    [parserLearningCaseStatusLabel("LINKED", "en"), parserLearningCaseStatusLabel("LINKED", "zh-CN")],
    [parserProfileLifecycleLabel("PAUSED", "en"), parserProfileLifecycleLabel("PAUSED", "zh-CN")],
    [parserProfileTrustStateLabel("REVIEW_REQUIRED", "en"), parserProfileTrustStateLabel("REVIEW_REQUIRED", "zh-CN")],
    [parserSourceKindLabel("PROFILE", "en"), parserSourceKindLabel("PROFILE", "zh-CN")],
    [generatedOrImportStatusLabel("REVIEW_REQUIRED", "en"), generatedOrImportStatusLabel("REVIEW_REQUIRED", "zh-CN")],
    [
      parserProfileContractCodeLabel("IMPORT_USED_BY_PARSER_LEARNING", "en"),
      parserProfileContractCodeLabel("IMPORT_USED_BY_PARSER_LEARNING", "zh-CN"),
    ],
    [
      parserProfileContractCodeLabel("PARSER_LEARNING_VALIDATION_FAILED", "en"),
      parserProfileContractCodeLabel("PARSER_LEARNING_VALIDATION_FAILED", "zh-CN"),
    ],
    [permissionCategoryLabel("parser_profiles", "en"), permissionCategoryLabel("parser_profiles", "zh-CN")],
    [permissionDescriptionLabel("parser_profiles.train", "en"), permissionDescriptionLabel("parser_profiles.train", "zh-CN")],
  ];

  for (const [english, chinese] of contracts) {
    assert.notEqual(english, chinese);
    assert.doesNotMatch(english, /[\u3400-\u9fff]/u);
    assert.match(chinese, /[\u3400-\u9fff]/u);
  }

  assert.equal(
    permissionDescriptionLabel("parser_profiles.train", "en"),
    "Train parser profiles.",
  );
  assert.equal(
    permissionDescriptionLabel("parser_profiles.review", "zh-CN"),
    "复核解析配置。",
  );
  assert.equal(
    permissionDescriptionLabel("parser_profiles.approve", "en"),
    "Approve parser profiles.",
  );
});

test("parser-profile UI permission helpers follow delegated grants", () => {
  const office: AuthUserResponse = {
    id: "office-parser-1",
    email: "office-parser@example.com",
    name: "Office",
    roles: ["OFFICE"],
    permissions: [
      "parser_profiles.read",
      "parser_profiles.train",
      "parser_profiles.review",
    ],
  };
  const warehouse: AuthUserResponse = {
    id: "warehouse-parser-1",
    email: "warehouse-parser@example.com",
    name: "Warehouse",
    roles: ["WAREHOUSE"],
    permissions: [],
  };

  assert.equal(canReadParserProfiles(office), true);
  assert.equal(canTrainParserProfiles(office), true);
  assert.equal(canReviewParserProfiles(office), true);
  assert.equal(canApproveParserProfiles(office), false);
  assert.equal(canReadParserProfiles(warehouse), false);
});
