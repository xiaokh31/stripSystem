import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { AuthUserResponse } from "../src/lib/api-client";
import {
  parserEvidenceOutcomeKey,
  parserMatchReasonKey,
  parserMaterialFieldKey,
  parserReviewIssueKey,
  parserReviewStatusKey,
} from "../src/components/parser-profiles/parser-profile-review-labels";
import {
  canDecideParserProfileReviews,
  canReadParserProfiles,
} from "../src/lib/permissions";
import { enMessages } from "../src/lib/i18n/locales/en";
import { zhMessages } from "../src/lib/i18n/locales/zh";

test("review, evidence, material, warning, and match codes resolve through both typed catalogs", () => {
  const keys = [
    parserReviewStatusKey("PENDING"),
    parserReviewStatusKey("CORRECTED"),
    parserEvidenceOutcomeKey("ACCEPTED"),
    parserEvidenceOutcomeKey("MATERIAL_CORRECTION"),
    parserEvidenceOutcomeKey("REJECTED"),
    parserMatchReasonKey("FINGERPRINT_ANCHOR_MATCHED"),
    parserMatchReasonKey("FINGERPRINT_RELATIVE_COLUMN_MATCHED"),
    parserReviewIssueKey("ZERO_VOLUME_WITH_CARTONS"),
    parserMaterialFieldKey("destinationCode"),
    parserMaterialFieldKey("mappingDefinition"),
  ];
  for (const key of keys) {
    assert.ok(enMessages[key]);
    assert.ok(zhMessages[key]);
    assert.notEqual(enMessages[key], zhMessages[key]);
    assert.doesNotMatch(enMessages[key], /[\u3400-\u9fff]/u);
    assert.match(zhMessages[key], /[\u3400-\u9fff]/u);
  }
});

test("review decisions require review plus both existing correction permissions", () => {
  const base: AuthUserResponse = {
    id: "office-1",
    email: null,
    name: "Office",
    roles: ["OFFICE"],
    permissions: ["parser_profiles.read", "parser_profiles.review"],
  };
  assert.equal(canReadParserProfiles(base), true);
  assert.equal(canDecideParserProfileReviews(base), false);
  assert.equal(
    canDecideParserProfileReviews({
      ...base,
      permissions: [
        ...base.permissions,
        "containers.update",
        "corrections.create",
      ],
    }),
    true,
  );
  assert.equal(
    canDecideParserProfileReviews({
      ...base,
      roles: ["WAREHOUSE"],
      permissions: [],
    }),
    false,
  );
});

test("review confirmations state 3-import trust consequences in each locale", () => {
  assert.match(enMessages["i18n.parserReview.dialog.accept.description"], /streak by one/i);
  assert.match(enMessages["i18n.parserReview.dialog.correct.description"], /0\/3/);
  assert.match(enMessages["i18n.parserReview.dialog.reject.description"], /0\/3/);
  assert.match(zhMessages["i18n.parserReview.dialog.accept.description"], /增加一次/);
  assert.match(zhMessages["i18n.parserReview.dialog.correct.description"], /0\/3/);
  assert.match(zhMessages["i18n.parserReview.dialog.reject.description"], /0\/3/);
});

test("review panel exposes explicit commands and never renders storage paths or internal JSON instructions", () => {
  const source = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/components/parser-profiles/parser-profile-review-panel.tsx",
    ),
    "utf8",
  );
  assert.match(source, /data-parser-profile-review/);
  assert.match(source, /i18n\.parserReview\.accept/);
  assert.match(source, /i18n\.parserReview\.correct/);
  assert.match(source, /i18n\.parserReview\.reject/);
  assert.match(source, /i18n\.parserReview\.addRow/);
  assert.match(source, /i18n\.parserReview\.removeRow/);
  assert.match(source, /deliveryMethod/);
  assert.match(source, /referenceNo/);
  assert.match(source, /poNumber/);
  assert.match(source, /finalCanonicalResult/);
  assert.match(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /storedPath|storagePath|JSON\.stringify/);
});
