import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContainerUnloadersRequest,
  buildContainerUnloadingCompletionRequest,
  buildContainerUnloadingWageSaveRequest,
  parseAssociatedContainerNos,
  summarizeInventorySync,
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
    reason: "",
    trailerNumber: "TR-0604",
  });
});

test("duplicate temporary unloaders are rejected before API submit", () => {
  const request = buildContainerUnloadersRequest(
    [
      {
        initialWorkerName: "",
        note: "",
        unloadingWorkerId: "temp-worker-1",
        workerCode: "TEMP-1",
        workerName: "Prototype Worker A",
        workerUserId: null,
      },
      {
        initialWorkerName: "",
        note: "",
        unloadingWorkerId: "temp-worker-1",
        workerCode: "TEMP-1",
        workerName: "Prototype Worker A",
        workerUserId: null,
      },
    ],
    "Workers confirmed",
  );

  assert.deepEqual(request, {
    error: "Duplicate unloader: Prototype Worker A.",
    ok: false,
  });
});

test("selected unloaders submit temporary directory ids and legacy names require reselection", () => {
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
            unloadingWorkerId: "temp-worker-1",
            workerCode: "W1",
            workerName: "Worker One",
            workerUserId: null,
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
          unloadingWorkerId: "temp-worker-1",
        },
      ],
    },
  });

  assert.deepEqual(
    buildContainerUnloadersRequest(
      [
        {
          ...drafts[0],
          initialWorkerName: "Worker Two",
          unloadingWorkerId: null,
          workerCode: "NAME:WORKER TWO",
          workerName: "Worker Two",
          workerUserId: "legacy-user-2",
        },
      ],
      "Workers confirmed",
    ),
    {
      error:
        "Legacy unloader Worker Two must be reselected from the temporary unloader directory before saving.",
      ok: false,
    },
  );

  assert.deepEqual(
    buildContainerUnloadersRequest(
      [
        {
          ...drafts[0],
          initialWorkerName: "Worker Two",
          unloadingWorkerId: null,
          workerCode: "NAME:WORKER TWO",
          workerName: "Worker Two",
          workerUserId: "legacy-user-2",
        },
      ],
      "Workers confirmed",
      "zh-CN",
    ),
    {
      error: "旧拆柜人 Worker Two 保存前必须从临时拆柜人目录重新选择。",
      ok: false,
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

test("inventory completion summary uses API active totals and never derives remaining", () => {
  assert.deepEqual(
    summarizeInventorySync([
      {
        containerId: "container-1",
        containerNo: "CSNU8877228",
        destinations: [
          {
            activeTotalPallets: 3,
            cancelledPallets: 0,
            containerDestinationId: "destination-1",
            createdPallets: 2,
            destinationCode: "YEG1",
            expectedPallets: 3,
            reusedPallets: 1,
            warnings: [],
          },
          {
            activeTotalPallets: 0,
            cancelledPallets: 0,
            containerDestinationId: "destination-2",
            createdPallets: 0,
            destinationCode: "YYC1",
            expectedPallets: 0,
            reusedPallets: 0,
            warnings: [],
          },
        ],
      },
    ]),
    {
      actualPallets: 3,
      destinationCount: 2,
      destinations: [
        {
          activeTotalPallets: 3,
          createdPallets: 2,
          destinationCode: "YEG1",
          reusedPallets: 1,
        },
        {
          activeTotalPallets: 0,
          createdPallets: 0,
          destinationCode: "YYC1",
          reusedPallets: 0,
        },
      ],
    },
  );
  assert.equal(summarizeInventorySync(undefined), null);
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
