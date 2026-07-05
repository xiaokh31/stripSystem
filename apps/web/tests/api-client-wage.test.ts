import test from "node:test";
import assert from "node:assert/strict";
import {
  completeContainerUnloading,
  completePayContainer,
  createPayContainer,
  generateAttendanceWageRecord,
  generateUnloadingWageSettlement,
  getAttendanceGeneratedFileDownloadUrl,
  getUnloadingWageSettlementFileDownloadUrl,
  listAttendanceImports,
  listUnloadingWageWorkers,
  listPayContainers,
  parseAttendanceImport,
  saveContainerUnloadingWage,
  updateContainerUnloaders,
  updateContainerPayClassification,
  updateContainerUnloadingWageAssociations,
} from "../src/lib/api-client";

test("attendance API client calls P1 attendance endpoints", async () => {
  const requests: Array<{ method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        attendanceImport: {
          id: "attendance-1",
        },
        items: [],
        limit: 10,
        offset: 0,
        rows: [],
        warnings: [],
        errors: [],
        generatedFile: { id: "file-1" },
        taskReport: null,
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  await listAttendanceImports(
    { limit: 10, offset: 0 },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await parseAttendanceImport("attendance 1", {
    baseUrl: "http://api.local/api",
    fetcher,
  });
  await generateAttendanceWageRecord("attendance 1", {
    baseUrl: "http://api.local/api",
    fetcher,
  });

  assert.deepEqual(requests, [
    {
      method: "GET",
      url: "http://api.local/api/attendance-imports?limit=10&offset=0",
    },
    {
      method: "POST",
      url: "http://api.local/api/attendance-imports/attendance%201/parse",
    },
    {
      method: "POST",
      url: "http://api.local/api/attendance-imports/attendance%201/generate-wage-record",
    },
  ]);
});

test("unloading wage API client calls pay container and settlement endpoints", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        id: "pay-container-1",
        items: [],
        limit: 50,
        offset: 0,
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  await updateContainerPayClassification(
    "container 1",
    {
      classification: "US_TO_CANADA_TRANSFER",
      trailerNumber: "TR-0604",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await createPayContainer(
    {
      classification: "OCEAN_CONTAINER",
      containerIds: ["container-1"],
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await listPayContainers(
    { limit: 50, offset: 0, status: "COMPLETED" },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await completePayContainer(
    "pay-container 1",
    {
      allocationMethod: "EQUAL_SPLIT",
      completedAt: "2026-06-04T17:10:00.000Z",
      unloaders: [{ workerCode: "W1", workerName: "Worker One" }],
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await generateUnloadingWageSettlement(
    { settlementMonth: "2026-06" },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: {
        classification: "US_TO_CANADA_TRANSFER",
        trailerNumber: "TR-0604",
      },
      method: "PATCH",
      url: "http://api.local/api/containers/container%201/pay-classification",
    },
    {
      body: {
        classification: "OCEAN_CONTAINER",
        containerIds: ["container-1"],
      },
      method: "POST",
      url: "http://api.local/api/pay-containers",
    },
    {
      body: null,
      method: "GET",
      url: "http://api.local/api/pay-containers?limit=50&offset=0&status=COMPLETED",
    },
    {
      body: {
        allocationMethod: "EQUAL_SPLIT",
        completedAt: "2026-06-04T17:10:00.000Z",
        unloaders: [{ workerCode: "W1", workerName: "Worker One" }],
      },
      method: "POST",
      url: "http://api.local/api/pay-containers/pay-container%201/complete-unloading",
    },
    {
      body: { settlementMonth: "2026-06" },
      method: "POST",
      url: "http://api.local/api/unloading-wage-settlements",
    },
  ]);
});

test("container detail unloading wage API client calls container-scoped endpoints", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        associatedContainers: [],
        containerId: "container-1",
        containerNo: "ZCSU9025988B",
        unloaders: [],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  await listUnloadingWageWorkers({
    baseUrl: "http://api.local/api",
    fetcher,
  });
  await saveContainerUnloadingWage(
    "container 1",
    {
      classification: "OCEAN_CONTAINER",
      trailerNumber: null,
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await updateContainerUnloadingWageAssociations(
    "container 1",
    {
      associatedContainerNos: ["TXGU5580229"],
      trailerNumber: "TR-0604",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await updateContainerUnloaders(
    "container 1",
    {
      unloaders: [
        {
          note: "Confirmed",
          workerUserId: "worker-1",
        },
      ],
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await completeContainerUnloading(
    "container 1",
    {
      completedAt: "2026-06-04T17:10:00.000Z",
      note: "Finished",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: null,
      method: "GET",
      url: "http://api.local/api/unloading-wage/workers",
    },
    {
      body: {
        classification: "OCEAN_CONTAINER",
        trailerNumber: null,
      },
      method: "PATCH",
      url: "http://api.local/api/containers/container%201/unloading-wage",
    },
    {
      body: {
        associatedContainerNos: ["TXGU5580229"],
        trailerNumber: "TR-0604",
      },
      method: "PATCH",
      url: "http://api.local/api/containers/container%201/unloading-wage-associations",
    },
    {
      body: {
        unloaders: [
          {
            note: "Confirmed",
            workerUserId: "worker-1",
          },
        ],
      },
      method: "PUT",
      url: "http://api.local/api/containers/container%201/unloaders",
    },
    {
      body: {
        completedAt: "2026-06-04T17:10:00.000Z",
        note: "Finished",
      },
      method: "POST",
      url: "http://api.local/api/containers/container%201/complete-unloading",
    },
  ]);
});

test("wage generated file download helpers point at web proxy routes", () => {
  assert.equal(
    getAttendanceGeneratedFileDownloadUrl("attendance 1", "file 1", "/api"),
    "/work-hours/attendance%201/files/file%201/download",
  );
  assert.equal(
    getUnloadingWageSettlementFileDownloadUrl("settlement 1", "file 1", "/api"),
    "/unloading-wage/settlements/settlement%201/files/file%201/download",
  );
});
