import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDestinationCorrectionRequest,
  draftFromDestination,
  issueList,
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

function destinationRecord(
  overrides: Partial<ContainerDetailDestinationResponse> = {},
): ContainerDetailDestinationResponse {
  return {
    calculatedPallets: 4,
    containerId: "container-1",
    createdAt: "2026-06-27T00:00:00.000Z",
    destinationCode: "YYZ",
    destinationType: "AMAZON_FBA",
    errors: [],
    finalPallets: 4,
    id: "destination-1",
    manualPallets: null,
    note: null,
    totalCartons: 40,
    totalVolumeCbm: "5.250",
    updatedAt: "2026-06-27T00:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}
