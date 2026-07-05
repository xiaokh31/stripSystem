import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContainerUnloadersRequest,
  buildContainerUnloadingCompletionRequest,
  buildContainerUnloadingWageSaveRequest,
  parseAssociatedContainerNos,
  unloaderDraftsFromContainer,
  wageDraftFromContainer,
} from "../src/components/containers/container-unloading-wage-flow";
import type { ContainerDetailResponse } from "../src/lib/api-client";

test("ocean unloading wage payload ignores trailer and associated containers", () => {
  const request = buildContainerUnloadingWageSaveRequest("ZCSU9025988B", {
    associatedContainerNosText: "TXGU5580229",
    classification: "OCEAN_CONTAINER",
    note: "Reviewed",
    reason: "Office review",
    trailerNumber: "TR-0604",
  });

  assert.deepEqual(request, {
    ok: true,
    payload: {
      kind: "ocean",
      payload: {
        classification: "OCEAN_CONTAINER",
        note: "Reviewed",
        reason: "Office review",
        trailerNumber: null,
      },
    },
  });
});

test("US-to-Canada unloading wage requires trailer number", () => {
  const request = buildContainerUnloadingWageSaveRequest("ZCSU9025988B", {
    associatedContainerNosText: "TXGU5580229",
    classification: "US_TO_CANADA_TRANSFER",
    note: "",
    reason: "",
    trailerNumber: " ",
  });

  assert.deepEqual(request, {
    error: "US-to-Canada transfer requires a trailer number.",
    ok: false,
  });
});

test("associated container numbers are unique, uppercase, and exclude current container", () => {
  assert.deepEqual(
    parseAssociatedContainerNos(
      "txgu5580229, zcsu9025988b + TXGU5580229\nTGBU1234567B",
      "ZCSU9025988B",
    ),
    ["TXGU5580229", "TGBU1234567B"],
  );
});

test("container detail wage draft starts from API unloading wage data", () => {
  const draft = wageDraftFromContainer(
    containerRecord({
      unloadingWage: {
        associatedContainers: [
          {
            containerId: "container-zcsu",
            containerNo: "ZCSU9025988B",
            id: "link-1",
          },
          {
            containerId: "container-txgu",
            containerNo: "TXGU5580229",
            id: "link-2",
          },
        ],
        classification: "US_TO_CANADA_TRANSFER",
        completedAt: null,
        completedById: null,
        completionNote: null,
        currency: "CAD",
        payContainerId: "pay-container-1",
        payContainerNo: "PC-TRAILER-TR-0604",
        rateAmount: "360.00",
        status: "DRAFT",
        trailerNumber: "TR-0604",
        unloaders: [],
      },
    }),
  );

  assert.deepEqual(draft, {
    associatedContainerNosText: "TXGU5580229",
    classification: "US_TO_CANADA_TRANSFER",
    note: "",
    reason: "Container detail unloading wage updated",
    trailerNumber: "TR-0604",
  });
});

test("duplicate unloader names are rejected before API submit", () => {
  const request = buildContainerUnloadersRequest(
    [
      {
        initialWorkerName: "",
        note: "",
        workerCode: "",
        workerName: "Prototype Worker A",
        workerUserId: null,
      },
      {
        initialWorkerName: "",
        note: "",
        workerCode: "",
        workerName: " prototype   worker a ",
        workerUserId: null,
      },
    ],
    "Workers confirmed",
  );

  assert.deepEqual(request, {
    error: "Duplicate unloader: prototype   worker a.",
    ok: false,
  });
});

test("existing unloader code is preserved only while worker name is unchanged", () => {
  const drafts = unloaderDraftsFromContainer(
    containerRecord({
      unloadingWage: {
        associatedContainers: [],
        classification: "OCEAN_CONTAINER",
        completedAt: null,
        completedById: null,
        completionNote: null,
        currency: "CAD",
        payContainerId: "pay-container-1",
        payContainerNo: "PC-OCEAN-ZCSU9025988B",
        rateAmount: "300.00",
        status: "DRAFT",
        trailerNumber: null,
        unloaders: [
          {
            id: "unloader-1",
            note: null,
            workerCode: "W1",
            workerName: "Worker One",
            workerUserId: "user-1",
          },
        ],
      },
    }),
  );

  assert.deepEqual(buildContainerUnloadersRequest(drafts, "Workers confirmed"), {
    ok: true,
    payload: {
      reason: "Workers confirmed",
      unloaders: [
        {
          note: null,
          workerCode: "W1",
          workerName: "Worker One",
          workerUserId: "user-1",
        },
      ],
    },
  });

  assert.deepEqual(
    buildContainerUnloadersRequest(
      [{ ...drafts[0], workerName: "Worker Two" }],
      "Workers confirmed",
    ),
    {
      ok: true,
      payload: {
        reason: "Workers confirmed",
        unloaders: [
          {
            note: null,
            workerCode: null,
            workerName: "Worker Two",
            workerUserId: null,
          },
        ],
      },
    },
  );
});

test("completion request requires a valid completed timestamp", () => {
  assert.deepEqual(
    buildContainerUnloadingCompletionRequest({
      completedAt: "",
      note: "",
      reason: "",
    }),
    {
      error: "Completed date and time are required.",
      ok: false,
    },
  );

  assert.deepEqual(
    buildContainerUnloadingCompletionRequest({
      completedAt: "2026-06-04T17:10:00.000Z",
      note: "Finished",
      reason: "Done",
    }),
    {
      ok: true,
      payload: {
        completedAt: "2026-06-04T17:10:00.000Z",
        note: "Finished",
        reason: "Done",
      },
    },
  );
});

function containerRecord(
  overrides: Partial<ContainerDetailResponse> = {},
): ContainerDetailResponse {
  return {
    company: null,
    containerNo: "ZCSU9025988B",
    createdAt: "2026-06-04T17:00:00.000Z",
    destinations: [],
    dockNo: null,
    errors: [],
    id: "container-zcsu",
    importFileId: "import-1",
    parserVersion: "unloading-plan-cn-v1",
    payClassification: null,
    payContainers: [],
    payTrailerNumber: null,
    rawJson: {},
    sourceFormat: "UNLOADING_PLAN_CN",
    status: "PARSED",
    totalCartons: 40,
    totalVolumeCbm: "5.250",
    unloadingWage: null,
    updatedAt: "2026-06-04T17:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}
