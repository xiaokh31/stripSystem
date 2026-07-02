import test from "node:test";
import assert from "node:assert/strict";
import {
  closeLoadJob,
  createLoadJob,
  deleteLoadJob,
  getLoadJobLoadedPallets,
  listLoadJobContainerSuggestions,
  listMyLoadJobOperatorHistory,
  listLoadJobs,
  reverseLoadJobScan,
  scanLoadJobPallet,
  updateLoadJob,
  type LoadJobResponse,
} from "../src/lib/api-client";

const loadJob: LoadJobResponse = {
  id: "load-job 1",
  containerId: null,
  container: null,
  loadNo: "LOAD-2026-001",
  truckNo: "TRUCK-9",
  dockNo: "D3",
  carrier: "Carrier",
  destinationRegion: "YEG2",
  status: "IN_PROGRESS",
  canScan: true,
  createdById: null,
  createdBy: null,
  completedById: null,
  completedBy: null,
  completedAt: null,
  startedAt: "2026-06-27T10:00:00.000Z",
  scheduledDepartureAt: "2026-06-27T21:00:00.000Z",
  closedAt: null,
  createdAt: "2026-06-27T10:00:00.000Z",
  updatedAt: "2026-06-27T10:00:00.000Z",
  lines: [
    {
      id: "line-1",
      sequence: 0,
      sourceText: "CSNU8877228-1P",
      containerNo: "CSNU8877228",
      containerId: "container-1",
      container: {
        id: "container-1",
        containerNo: "CSNU8877228",
      },
      containerDestinationId: "destination-1",
      destinationCode: "YEG2",
      plannedPallets: 1,
      externalTransfer: false,
      note: null,
      createdAt: "2026-06-27T10:00:00.000Z",
      updatedAt: "2026-06-27T10:00:00.000Z",
    },
  ],
  plannedPalletCount: 1,
  externalPalletCount: 0,
  palletCount: 0,
  eventCount: 0,
};

test("load job API client lists open load jobs with API filters", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));

    return new Response(
      JSON.stringify({
        items: [loadJob],
        limit: 25,
        offset: 0,
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await listLoadJobs(
    { limit: 25, status: "IN_PROGRESS" },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    "http://api.local/api/load-jobs?limit=25&status=IN_PROGRESS",
  ]);
  assert.equal(result.items[0]?.loadNo, "LOAD-2026-001");
});

test("load job API client lists container suggestions for a destination", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));

    return new Response(
      JSON.stringify({
        items: [
          {
            containerId: "container-1",
            containerNo: "CSNU8877228",
            containerDestinationId: "destination-1",
            destinationCode: "YEG2",
            destinationType: "AMAZON_FBA",
            finalPallets: 8,
            loadedPallets: 2,
            remainingPallets: 6,
            status: "LABELS_GENERATED",
          },
        ],
        limit: 20,
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await listLoadJobContainerSuggestions(
    " YEG2 ",
    { containerNo: " csnu " },
    {
      baseUrl: "http://api.local/api",
      fetcher,
    },
  );

  assert.deepEqual(requests, [
    "http://api.local/api/load-jobs/container-suggestions?destinationRegion=YEG2&containerNo=csnu&limit=20",
  ]);
  assert.equal(result.items[0]?.remainingPallets, 6);
});

test("load job API client sends supervisor override scan payload", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        result: "LOADED",
        loadJob: { ...loadJob, palletCount: 1 },
        pallet: {
          id: "pallet-1",
          containerId: "container-1",
          containerNo: "CSNU8877228",
          containerDestinationId: "destination-1",
          destinationCode: "YEG2",
          destinationType: "AMAZON_FBA",
          palletNo: 1,
          palletId: "PALLET-001",
          qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
          status: "LOADED",
          loadedAt: "2026-06-27T10:05:00.000Z",
          loadJobId: "load-job 1",
        },
        progress: {
          totalPallets: 1,
          loadedPallets: 1,
          remainingPallets: 0,
        },
        eventId: "event-1",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 201,
      },
    );
  };

  await scanLoadJobPallet(
    "load-job 1",
    {
      overrideReason: "Supervisor approved wrong truck correction.",
      qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
      supervisorOverride: true,
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: {
        overrideReason: "Supervisor approved wrong truck correction.",
        qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
        supervisorOverride: true,
      },
      method: "POST",
      url: "http://api.local/api/load-jobs/load-job%201/scan",
    },
  ]);
});

test("load job API client creates office load plans", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(JSON.stringify(loadJob), {
      headers: { "content-type": "application/json" },
      status: 201,
    });
  };

  const result = await createLoadJob(
    {
      destinationRegion: "YEG2",
      dockNo: "D3",
      lines: [
        {
          containerNo: "CSNU8877228",
          destinationCode: "YEG2",
          plannedPallets: 1,
          sourceText: "CSNU8877228-1P",
        },
        {
          externalTransfer: true,
          plannedPallets: 3,
          sourceText: "FFAU3143604转运-3P",
        },
      ],
      loadNo: "LOAD-2026-001",
      scheduledDepartureAt: "2026-06-27T21:00:00.000Z",
      truckNo: "TRUCK-9",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: {
        destinationRegion: "YEG2",
        dockNo: "D3",
        lines: [
          {
            containerNo: "CSNU8877228",
            destinationCode: "YEG2",
            plannedPallets: 1,
            sourceText: "CSNU8877228-1P",
          },
          {
            externalTransfer: true,
            plannedPallets: 3,
            sourceText: "FFAU3143604转运-3P",
          },
        ],
        loadNo: "LOAD-2026-001",
        scheduledDepartureAt: "2026-06-27T21:00:00.000Z",
        truckNo: "TRUCK-9",
      },
      method: "POST",
      url: "http://api.local/api/load-jobs",
    },
  ]);
  assert.equal(result.loadNo, "LOAD-2026-001");
});

test("load job API client updates and deletes load jobs", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(JSON.stringify(loadJob), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  await updateLoadJob(
    "load-job 1",
    {
      dockNo: "D4",
      status: "IN_PROGRESS",
      truckNo: "TRUCK-10",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await deleteLoadJob("load-job 1", {
    baseUrl: "http://api.local/api",
    fetcher,
  });

  assert.deepEqual(requests, [
    {
      body: {
        dockNo: "D4",
        status: "IN_PROGRESS",
        truckNo: "TRUCK-10",
      },
      method: "PATCH",
      url: "http://api.local/api/load-jobs/load-job%201",
    },
    {
      body: null,
      method: "DELETE",
      url: "http://api.local/api/load-jobs/load-job%201",
    },
  ]);
});

test("load job API client posts scanner input to the scan endpoint", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        result: "LOADED",
        loadJob: { ...loadJob, palletCount: 1 },
        pallet: {
          id: "pallet-1",
          containerId: "container-1",
          containerNo: "CSNU8877228",
          containerDestinationId: "destination-1",
          destinationCode: "YEG2",
          destinationType: "AMAZON_FBA",
          palletNo: 1,
          palletId: "PALLET-001",
          qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
          status: "LOADED",
          loadedAt: "2026-06-27T10:05:00.000Z",
          loadJobId: "load-job 1",
        },
        progress: {
          totalPallets: 1,
          loadedPallets: 1,
          remainingPallets: 0,
        },
        eventId: "event-1",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 201,
      },
    );
  };

  const result = await scanLoadJobPallet(
    "load-job 1",
    {
      deviceId: "web-mobile-scan",
      qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: {
        deviceId: "web-mobile-scan",
        qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
      },
      method: "POST",
      url: "http://api.local/api/load-jobs/load-job%201/scan",
    },
  ]);
  assert.equal(result.pallet.containerNo, "CSNU8877228");
  assert.equal(result.progress.remainingPallets, 0);
});

test("load job API client reads currently loaded pallets", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));

    return new Response(
      JSON.stringify({
        items: [
          {
            id: "pallet-1",
            containerId: "container-1",
            containerNo: "CSNU8877228",
            containerDestinationId: "destination-1",
            destinationCode: "YEG2",
            destinationType: "AMAZON_FBA",
            palletNo: 1,
            palletId: "PALLET-001",
            qrPayload:
              "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
            status: "LOADED",
            loadedAt: "2026-06-27T10:05:00.000Z",
            loadJobId: "load-job 1",
          },
        ],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await getLoadJobLoadedPallets("load-job 1", {
    baseUrl: "http://api.local/api",
    fetcher,
  });

  assert.deepEqual(requests, [
    "http://api.local/api/load-jobs/load-job%201/loaded-pallets",
  ]);
  assert.equal(result.items[0]?.status, "LOADED");
});

test("load job API client lists the current operator loading history", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));

    return new Response(
      JSON.stringify({
        items: [
          {
            id: "load-job 1",
            loadNo: "LOAD-2026-001",
            destinationRegion: "YEG2",
            truckNo: "TRUCK-9",
            dockNo: "D3",
            carrier: "Carrier",
            scheduledDepartureAt: "2026-06-27T21:00:00.000Z",
            completedAt: "2026-06-27T23:00:00.000Z",
            completedById: "user-warehouse",
            completedBy: {
              id: "user-warehouse",
              email: "warehouse@example.test",
              name: "Warehouse User",
              role: "WAREHOUSE",
            },
            totalPallets: 1,
            pallets: [
              {
                id: "pallet-1",
                containerId: "container-1",
                containerNo: "CSNU8877228",
                containerDestinationId: "destination-1",
                destinationCode: "YEG2",
                destinationType: "AMAZON_FBA",
                palletNo: 1,
                palletId: "PALLET-001",
                qrPayload:
                  "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
                status: "LOADED",
                loadedAt: "2026-06-27T22:05:00.000Z",
                loadJobId: "load-job 1",
              },
            ],
          },
        ],
        limit: 25,
        offset: 0,
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await listMyLoadJobOperatorHistory(
    { limit: 25, offset: 0 },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    "http://api.local/api/load-jobs/operator-history/me?limit=25&offset=0",
  ]);
  assert.equal(result.items[0]?.completedBy?.name, "Warehouse User");
  assert.equal(result.items[0]?.pallets[0]?.containerNo, "CSNU8877228");
});

test("load job API client closes a job through the close endpoint", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        ...loadJob,
        canScan: false,
        closedAt: "2026-06-27T22:00:00.000Z",
        status: "COMPLETED",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 201,
      },
    );
  };

  const result = await closeLoadJob(
    "load-job 1",
    {
      dockNo: "D3",
      note: "Completed from mobile scan page.",
      reason: "Warehouse loading completed.",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: {
        dockNo: "D3",
        note: "Completed from mobile scan page.",
        reason: "Warehouse loading completed.",
      },
      method: "POST",
      url: "http://api.local/api/load-jobs/load-job%201/close",
    },
  ]);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.canScan, false);
});

test("load job API client posts confirmed reverse scan adjustments", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        result: "REMOVED",
        loadJob,
        pallet: {
          id: "pallet-1",
          containerId: "container-1",
          containerNo: "CSNU8877228",
          containerDestinationId: "destination-1",
          destinationCode: "YEG2",
          destinationType: "AMAZON_FBA",
          palletNo: 1,
          palletId: "PALLET-001",
          qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/1|PALLET-001",
          status: "LABEL_PRINTED",
          loadedAt: null,
          loadJobId: null,
        },
        progress: {
          totalPallets: 1,
          loadedPallets: 0,
          remainingPallets: 1,
        },
        eventId: "event-2",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 201,
      },
    );
  };

  const result = await reverseLoadJobScan(
    "load-job 1",
    {
      confirm: true,
      deviceId: "web-mobile-scan",
      palletRecordId: "pallet-1",
      reason: "Need to combine pallets",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: {
        confirm: true,
        deviceId: "web-mobile-scan",
        palletRecordId: "pallet-1",
        reason: "Need to combine pallets",
      },
      method: "POST",
      url: "http://api.local/api/load-jobs/load-job%201/scan/reverse",
    },
  ]);
  assert.equal(result.result, "REMOVED");
  assert.equal(result.progress.remainingPallets, 1);
});
