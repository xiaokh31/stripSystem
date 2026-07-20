import assert from "node:assert/strict";
import test from "node:test";
import {
  availableParserProfileActions,
  eligibilityKey,
  parserProfileErrorKey,
  parserProfileMappedFieldLabel,
  parserProfileStructuralAnchors,
} from "../src/components/parser-profiles/parser-profile-labels";
import { enMessages } from "../src/lib/i18n/locales/en";
import { zhMessages } from "../src/lib/i18n/locales/zh";

test("OFFICE can read/train but cannot see governance mutations", () => {
  assert.deepEqual(
    availableParserProfileActions("DRAFT", true, false, true),
    [],
  );
  assert.deepEqual(
    availableParserProfileActions("ACTIVE", true, false, true),
    ["fork"],
  );
});

test("authorized approver sees only lifecycle-valid controls", () => {
  assert.deepEqual(
    availableParserProfileActions("DRAFT", false, true, true),
    [],
  );
  assert.deepEqual(
    availableParserProfileActions("DRAFT", true, true, true),
    ["approve"],
  );
  assert.deepEqual(
    availableParserProfileActions("ACTIVE", true, true, true),
    ["pause", "retire", "fork"],
  );
  assert.deepEqual(
    availableParserProfileActions("PAUSED", true, true, false),
    ["resume", "retire"],
  );
});

test("stable backend failures map to bilingual catalog keys", () => {
  const keys = [
    parserProfileErrorKey("FORBIDDEN"),
    parserProfileErrorKey("PROFILE_LIFECYCLE_REVISION_CONFLICT"),
    parserProfileErrorKey("PROFILE_APPROVAL_ACTIVE_MATCHER_CONFLICT"),
    eligibilityKey("PROFILE_APPROVAL_SOURCE_NOT_READABLE"),
    eligibilityKey("PROFILE_APPROVAL_REPLAY_NOT_PASSED"),
  ];
  for (const key of keys) {
    assert.ok(enMessages[key]);
    assert.ok(zhMessages[key]);
    assert.notEqual(enMessages[key], zhMessages[key]);
  }
});

test("approval confirmation explicitly promises review-required 0/3, not trust", () => {
  assert.match(enMessages["i18n.parserProfiles.approveConfirm"], /0\/3/);
  assert.match(enMessages["i18n.parserProfiles.approveConfirm"], /review-required/i);
  assert.match(zhMessages["i18n.parserProfiles.approveConfirm"], /0\/3/);
  assert.match(zhMessages["i18n.parserProfiles.approveConfirm"], /每次需复核/);
});

test("mapping fields and structural anchors use operator-facing labels", () => {
  assert.equal(
    parserProfileMappedFieldLabel("destinationCode", (key) => enMessages[key]),
    "Destination",
  );
  assert.equal(
    parserProfileMappedFieldLabel("destinationCode", (key) => zhMessages[key]),
    "目的仓",
  );
  assert.deepEqual(
    parserProfileStructuralAnchors({
      anchors: [{ value: "仓库", row: 2, column: 1 }],
    }),
    ["仓库"],
  );
});
