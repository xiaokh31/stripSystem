import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCreateDestinationRequest,
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

test("manual pallets cannot be set to zero because empty destinations should be deleted", () => {
  const destination = destinationRecord({ manualPallets: 6 });
  const draft = {
    ...draftFromDestination(destination),
    manualPallets: "0",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: false,
    error:
      "Manual pallets must be a whole number of 1 or greater. Delete the destination instead when there is no cargo.",
  });
});

test("actual note alone is treated as a persisted destination change", () => {
  const destination = destinationRecord();
  const draft = {
    ...draftFromDestination(destination),
    note: "Office adjusted actual unloading note",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: true,
    changedFields: ["note"],
    payload: {
      note: "Office adjusted actual unloading note",
    },
  });
});

test("actual note can be cleared to null", () => {
  const destination = destinationRecord({ note: "Old actual unloading note" });
  const draft = {
    ...draftFromDestination(destination),
    note: "  ",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: true,
    changedFields: ["note"],
    payload: {
      note: null,
    },
  });
});

test("volume formatting alone is not treated as a change", () => {
  const destination = destinationRecord({ totalVolumeCbm: "5.250" });
  const draft = {
    ...draftFromDestination(destination),
    volume: "5.25",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: false,
    error:
      "Change a business field such as destination, actual cartons, actual CBM, actual pallets, or actual note before saving.",
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
      "Change a business field such as destination, actual cartons, actual CBM, actual pallets, or actual note before saving.",
  });
});

test("whitespace actual note with audit note only still requires a business change", () => {
  const destination = destinationRecord();
  const draft = {
    ...draftFromDestination(destination),
    correctionNote: "Audit explanation only",
    note: "   ",
  };

  assert.deepEqual(buildDestinationCorrectionRequest(destination, draft), {
    ok: false,
    error:
      "Change a business field such as destination, actual cartons, actual CBM, actual pallets, or actual note before saving.",
  });
});

test("create destination payload omits package type so API applies default carton", () => {
  const draft = {
    cartons: "10",
    correctionNote: "Added from paper report",
    destinationCode: "Private Address / WB-DEFAULT-CARTON",
    destinationType: "PARCEL_PRIVATE",
    manualPallets: "",
    note: "Actual line",
    volume: "3.61",
  };

  assert.deepEqual(buildCreateDestinationRequest(draft), {
    ok: true,
    payload: {
      cartons: 10,
      correctionNote: "Added from paper report",
      destinationCode: "Private Address / WB-DEFAULT-CARTON",
      destinationType: "PARCEL_PRIVATE",
      manualPallets: null,
      note: "Actual line",
      volume: 3.61,
    },
  });
});

test("create destination rejects zero manual pallets", () => {
  const draft = {
    cartons: "0",
    correctionNote: "No cargo",
    destinationCode: "YYC4",
    destinationType: "WAREHOUSE",
    manualPallets: "0",
    note: "",
    volume: "0",
  };

  assert.deepEqual(buildCreateDestinationRequest(draft), {
    ok: false,
    error:
      "Manual pallets must be a whole number of 1 or greater. Delete the destination instead when there is no cargo.",
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
    [
      "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.",
    ],
  );
});

test("destination warning summaries group repeated business issues", () => {
  const summaries = summarizeIssues([
    "Destination code is missing.",
    "Volume is 0 while cartons are greater than 0.",
    "Destination code is missing.",
    {
      code: "ZERO_VOLUME_WITH_CARTONS",
      message: "Volume is 0 while cartons are greater than 0.",
    },
  ]);

  assert.deepEqual(
    summaries.map((summary) => formatIssueSummary(summary)),
    [
      "Destination code is missing. 2x",
      "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation. 2x",
    ],
  );
});

test("destination warning lists localize stable pallet calculation issue codes", () => {
  assert.deepEqual(
    issueList([
      {
        code: "NEED_CONFIRM_DESTINATION_TYPE",
        destinationCode: "PUR",
        message: "Check",
      },
      {
        code: "ZERO_VOLUME_WITH_CARTONS",
        destinationCode: "PUR",
        message: "PUR 体积为0的有12箱，已按0.01 CBM参与托盘计算。",
      },
      {
        code: "ZERO_VOLUME_WITH_CARTONS",
        field: "volumeCbm",
        message: "第18行体积为0，共4箱，已按0.01 CBM参与托盘计算。",
      },
    ]),
    [
      "Destination type was not recognized; pallet rule needs confirmation.",
      "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.",
      "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.",
    ],
  );
  assert.deepEqual(
    issueList(
      [
        {
          code: "NEED_CONFIRM_DESTINATION_TYPE",
          destinationCode: "PUR",
          message: "Check",
        },
        {
          code: "ZERO_VOLUME_WITH_CARTONS",
          destinationCode: "PUR",
          message: "PUR 体积为0的有12箱，已按0.01 CBM参与托盘计算。",
        },
      ],
      "zh-CN",
    ),
    [
      "目的仓类型无法识别，托盘规则需要复核。",
      "0.01 CBM 已用于托盘计算，因为体积为 0 但箱数大于 0。",
    ],
  );
});

test("container detail rule summary exposes pallet calculation metadata", () => {
  assert.equal(
    ruleSummary(destinationRecord()),
    "Package carton · Private/commercial carton volume rule · Basis 1.800 CBM · Rounding up",
  );
});

test("container detail exposes UPS courier carton rule metadata and pallets", () => {
  const destination = destinationRecord({
    calculatedPallets: 3,
    destinationCode: "UPS",
    destinationType: "PARCEL_PRIVATE",
    finalPallets: 3,
    packageType: "CARTON",
    palletRuleCode: "ADDRESS_CARTON_VOLUME_1_8",
    totalCartons: 57,
    totalVolumeCbm: "5.400",
  });

  assert.equal(destination.calculatedPallets, 3);
  assert.equal(destination.finalPallets, 3);
  assert.equal(
    ruleSummary(destination),
    "Package carton · Private/commercial carton volume rule · Basis 1.800 CBM · Rounding up",
  );
});

test("container detail localizes known warehouse and address pallet rules", () => {
  assert.equal(
    ruleSummary(
      destinationRecord({
        calculationBasisCbm: "1.700",
        packageType: null,
        palletRuleCode: "YEG1_VOLUME_1_7_PLUS_5",
      }),
    ),
    "YEG1 1.7 CBM plus 5 pallets rule · Basis 1.700 CBM · Rounding up",
  );
  assert.equal(
    ruleSummary(
      destinationRecord({
        calculationBasisCbm: null,
        packageType: "WOODEN_CRATE",
        palletRuleCode: "ADDRESS_WOODEN_CRATE_PIECE_COUNT",
        roundingMode: "PIECE_COUNT",
      }),
    ),
    "Package wooden crate · Private/commercial wooden crate piece-count rule · Rounding by piece count",
  );
});

test("container detail hides legacy package confirmation warning", () => {
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

  assert.equal(ruleSummary(destination).includes("Package carton"), true);
  assert.deepEqual(issueList(destination.warnings), []);
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
