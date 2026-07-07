import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDestinationCorrectionRequest,
  draftFromDestination,
  formatIssueSummary,
  issueList,
  ruleSummary,
  summarizeIssues,
} from "../src/components/containers/container-detail-flow";
import type { ContainerDetailDestinationResponse } from "../src/lib/api-client";

test("destination correction payload includes changed fields and note", () => {
  const destination = destinationRecord();
  const draft = {
    ...draftFromDestination(destination),
    cartons: "42",
    correctionNote: "Customer confirmed pallet count",
    destinationType: "WAREHOUSE",
    manualPallets: "6",
    volume: "5.75",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: true,
    changedFields: ["destinationType", "cartons", "volume", "manualPallets"],
    payload: {
      cartons: 42,
      correctionNote: "Customer confirmed pallet count",
      destinationType: "WAREHOUSE",
      manualPallets: 6,
      volume: 5.75,
    },
  });
});

test("manual pallets can be cleared to restore calculated pallets", () => {
  const destination = destinationRecord({ manualPallets: 6 });
  const draft = {
    ...draftFromDestination(destination),
    manualPallets: "",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: true,
    changedFields: ["manualPallets"],
    payload: {
      manualPallets: null,
    },
  });
});

test("correction note alone is not treated as a persisted destination change", () => {
  const destination = destinationRecord();
  const draft = {
    ...draftFromDestination(destination),
    correctionNote: "Only a note",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: false,
    error:
      "Change destination, actual cartons, actual CBM, actual pallets, or note before saving.",
  });
});

test("destination warning lists preserve structured parser issues", () => {
  assert.deepEqual(
    issueList([
      {
        code: "ZERO_VOLUME_WITH_CARTONS",
        field: "volume",
        message: "Volume is 0 but cartons are present.",
      },
    ]),
    ["Volume is 0 but cartons are present."],
  );
});

test("destination warning summaries group repeated business issues", () => {
  const summaries = summarizeIssues([
    "Destination code is missing.",
    "Volume is 0 while cartons are greater than 0.",
    "Destination code is missing.",
    {
      message: "Volume is 0 while cartons are greater than 0.",
    },
  ]);

  assert.deepEqual(
    summaries.map((summary) => formatIssueSummary(summary)),
    [
      "Destination code is missing.  2x",
      "Volume is 0 while cartons are greater than 0.  2x",
    ],
  );
});

test("container detail rule summary exposes pallet calculation metadata", () => {
  assert.equal(
    ruleSummary(destinationRecord()),
    "Package CARTON · Rule ADDRESS_CARTON_VOLUME_1_8 · Basis 1.800 CBM · Rounding CEIL",
  );
});

test("container detail keeps unknown package warning visible", () => {
  const destination = destinationRecord({
    packageType: "UNKNOWN",
    warnings: [
      {
        code: "PACKAGE_TYPE_CONFIRMATION_REQUIRED",
        message:
          "Private or commercial address package type was not recognized; manual confirmation is required.",
      },
    ],
  });

  assert.equal(ruleSummary(destination).includes("Package UNKNOWN"), true);
  assert.deepEqual(issueList(destination.warnings), [
    "Private or commercial address package type was not recognized; manual confirmation is required.",
  ]);
});

test("container detail rule summary falls back cleanly when metadata is absent", () => {
  assert.equal(
    ruleSummary(
      destinationRecord({
        calculationBasisCbm: null,
        packageType: null,
        palletRuleCode: null,
        roundingMode: null,
      }),
    ),
    "-",
  );
});

function destinationRecord(
  overrides: Partial<ContainerDetailDestinationResponse> = {},
): ContainerDetailDestinationResponse {
  return {
    calculatedPallets: 4,
    calculationBasisCbm: "1.800",
    containerId: "container-1",
    createdAt: "2026-06-27T00:00:00.000Z",
    destinationCode: "YYZ",
    destinationType: "AMAZON_FBA",
    errors: [],
    finalPallets: 4,
    id: "destination-1",
    manualPallets: null,
    note: null,
    packageType: "CARTON",
    palletRuleCode: "ADDRESS_CARTON_VOLUME_1_8",
    roundingMode: "CEIL",
    totalCartons: 40,
    totalVolumeCbm: "5.250",
    updatedAt: "2026-06-27T00:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}
