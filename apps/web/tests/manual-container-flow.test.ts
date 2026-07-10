import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManualContainerRequest,
  defaultManualContainerDraft,
} from "../src/components/containers/manual-container-flow";

test("manual container draft builds POST /containers/manual payload", () => {
  const draft = defaultManualContainerDraft("import-1");
  draft.containerNo = " MANU1234567 ";
  draft.company = " Manual Customer ";
  draft.dockNo = " D7 ";
  draft.destinations = [
    {
      cartons: "36",
      destinationCode: " YEG1 ",
      destinationType: " WAREHOUSE ",
      note: "Manual report line",
      pallets: "4",
      volume: "0",
    },
    {
      cartons: "12",
      destinationCode: "YVR2",
      destinationType: "",
      note: "",
      pallets: "2",
      volume: "",
    },
  ];

  const result = buildManualContainerRequest(draft);

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.payload, {
    company: "Manual Customer",
    containerNo: "MANU1234567",
    correctionNote: "Manual entry created from import import-1.",
    destinations: [
      {
        cartons: 36,
        destinationCode: "YEG1",
        destinationType: "WAREHOUSE",
        note: "Manual report line",
        pallets: 4,
        volume: 0,
      },
      {
        cartons: 12,
        destinationCode: "YVR2",
        destinationType: null,
        note: null,
        pallets: 2,
      },
    ],
    dockNo: "D7",
    reason: "Original import import-1 could not be parsed.",
  });
});

test("manual container validation requires container and destination fields", () => {
  const draft = defaultManualContainerDraft();

  assert.deepEqual(buildManualContainerRequest(draft), {
    error: "Container number is required.",
    ok: false,
  });

  draft.containerNo = "MANU1234567";
  assert.deepEqual(buildManualContainerRequest(draft), {
    error: "Destination 1 requires a destination code.",
    ok: false,
  });

  draft.destinations[0].destinationCode = "YEG1";
  draft.destinations[0].cartons = "1.5";
  draft.destinations[0].pallets = "2";
  assert.deepEqual(buildManualContainerRequest(draft), {
    error: "Destination 1 cartons must be a whole number of 0 or greater.",
    ok: false,
  });

  draft.destinations[0].cartons = "0";
  draft.destinations[0].pallets = "0";
  assert.deepEqual(buildManualContainerRequest(draft), {
    error:
      "Destination 1 pallets must be a whole number of 1 or greater. Delete the destination row instead when there is no cargo.",
    ok: false,
  });
});
