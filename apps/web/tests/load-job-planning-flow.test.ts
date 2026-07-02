import test from "node:test";
import assert from "node:assert/strict";
import {
  applyContainerSuggestionToDraft,
  buildLoadJobRequest,
  defaultLoadJobDraft,
  loadJobPlanSummary,
} from "../src/components/load-jobs/load-job-planning-flow";

test("load job planning flow builds POST /load-jobs payload", () => {
  const draft = defaultLoadJobDraft();
  draft.loadNo = " 145757024984 ";
  draft.truckNo = " DOCK-2 ";
  draft.dockNo = " D3 ";
  draft.carrier = " Bestar ";
  draft.destinationRegion = " YEG2 ";
  draft.scheduledDepartureAt = "2026-06-27T21:00";
  draft.lines = [
    {
      containerNo: " EITU9315039 ",
      destinationCode: " YEG2 ",
      externalTransfer: false,
      note: "",
      plannedPallets: "5",
      sourceText: " EITU9315039-5P ",
    },
    {
      containerNo: "",
      destinationCode: "YEG2",
      externalTransfer: true,
      note: "External freight",
      plannedPallets: "12",
      sourceText: "ZCSU9024512B转运-12P",
    },
  ];

  const result = buildLoadJobRequest(draft);

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.payload, {
    carrier: "Bestar",
    destinationRegion: "YEG2",
    dockNo: "D3",
    lines: [
      {
        containerNo: "EITU9315039",
        destinationCode: "YEG2",
        externalTransfer: false,
        plannedPallets: 5,
        sourceText: "EITU9315039-5P",
      },
      {
        destinationCode: "YEG2",
        externalTransfer: true,
        note: "External freight",
        plannedPallets: 12,
        sourceText: "ZCSU9024512B转运-12P",
      },
    ],
    loadNo: "145757024984",
    scheduledDepartureAt: new Date("2026-06-27T21:00").toISOString(),
    truckNo: "DOCK-2",
  });
});

test("load job planning flow requires line destination to match destination region", () => {
  const draft = defaultLoadJobDraft();
  draft.loadNo = "LOAD-1";
  draft.destinationRegion = "YEG2";
  draft.lines[0].containerNo = "CSNU5938021";
  draft.lines[0].destinationCode = "YYC1";
  draft.lines[0].plannedPallets = "1";

  assert.deepEqual(buildLoadJobRequest(draft), {
    error: "Plan line 1 destination must match Destination region YEG2.",
    ok: false,
  });
});

test("load job planning flow accepts pallet count from source text", () => {
  const draft = defaultLoadJobDraft();
  draft.loadNo = "LOAD-1";
  draft.lines[0].sourceText = "CSNU5938021-11P-part1";

  const result = buildLoadJobRequest(draft);

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.payload.lines, [
    {
      externalTransfer: false,
      sourceText: "CSNU5938021-11P-part1",
    },
  ]);
});

test("load job planning flow validates required fields", () => {
  const draft = defaultLoadJobDraft();

  assert.deepEqual(buildLoadJobRequest(draft), {
    error: "Load number is required.",
    ok: false,
  });

  draft.loadNo = "LOAD-1";
  assert.deepEqual(buildLoadJobRequest(draft), {
    error: "Plan line 1 requires source text or container number.",
    ok: false,
  });

  draft.lines[0].containerNo = "CSNU5938021";
  draft.lines[0].plannedPallets = "0";
  assert.deepEqual(buildLoadJobRequest(draft), {
    error: "Plan line 1 system pallets must be greater than 0.",
    ok: false,
  });
});

test("load job planning summary separates system and external pallets", () => {
  const draft = defaultLoadJobDraft();
  draft.lines = [
    {
      containerNo: "EITU9315039",
      destinationCode: "YEG2",
      externalTransfer: false,
      note: "",
      plannedPallets: "5",
      sourceText: "EITU9315039-5P",
    },
    {
      containerNo: "",
      destinationCode: "YEG2",
      externalTransfer: true,
      note: "",
      plannedPallets: "12",
      sourceText: "ZCSU9024512B转运-12P",
    },
  ];

  assert.deepEqual(loadJobPlanSummary(draft), {
    externalPallets: 12,
    internalPallets: 5,
    lineCount: 2,
  });
});

test("load job planning applies a container suggestion to the first empty system line", () => {
  const draft = defaultLoadJobDraft();
  draft.loadNo = "LOAD-1";
  draft.destinationRegion = " yeg2 ";

  const updated = applyContainerSuggestionToDraft(draft, {
    containerId: "container-1",
    containerNo: "CSNU8877228",
    containerDestinationId: "destination-1",
    destinationCode: "YEG2",
    destinationType: "AMAZON_FBA",
    finalPallets: 8,
    loadedPallets: 2,
    remainingPallets: 6,
    status: "LABELS_GENERATED",
  });

  assert.equal(updated.destinationRegion, "YEG2");
  assert.deepEqual(updated.lines, [
    {
      containerNo: "CSNU8877228",
      destinationCode: "YEG2",
      externalTransfer: false,
      note: "",
      plannedPallets: "6",
      sourceText: "CSNU8877228-6P",
    },
  ]);
});

test("load job planning applies a container suggestion to the focused system line", () => {
  const draft = defaultLoadJobDraft();
  draft.loadNo = "LOAD-1";
  draft.destinationRegion = "YEG2";
  draft.lines = [
    {
      containerNo: "",
      destinationCode: "YEG2",
      externalTransfer: false,
      note: "",
      plannedPallets: "",
      sourceText: "",
    },
    {
      containerNo: "",
      destinationCode: "YEG2",
      externalTransfer: false,
      note: "",
      plannedPallets: "",
      sourceText: "",
    },
  ];

  const updated = applyContainerSuggestionToDraft(
    draft,
    {
      containerId: "container-2",
      containerNo: "MSCU4455667",
      containerDestinationId: "destination-2",
      destinationCode: "YEG2",
      destinationType: "AMAZON_FBA",
      finalPallets: 10,
      loadedPallets: 4,
      remainingPallets: 6,
      status: "LABELS_GENERATED",
    },
    1,
  );

  assert.equal(updated.lines[0]?.containerNo, "");
  assert.deepEqual(updated.lines[1], {
    containerNo: "MSCU4455667",
    destinationCode: "YEG2",
    externalTransfer: false,
    note: "",
    plannedPallets: "6",
    sourceText: "MSCU4455667-6P",
  });
});
