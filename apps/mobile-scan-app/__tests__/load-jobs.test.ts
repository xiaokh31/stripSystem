import test from "node:test";
import assert from "node:assert/strict";
import { NativeApiError } from "../src/api/api-error";
import {
  closeLoadJob,
  getLoadJob,
  listOpenLoadJobs,
  updateLoadJob,
} from "../src/load-jobs/load-jobs-client";
import {
  bayBoardJobs,
  compareBayBoardJobs,
  formatNullable,
  loadJobDisplayName,
  loadJobLineSummary,
  loadJobProgress,
} from "../src/load-jobs/load-job-view-model";
import type { LoadJob } from "../src/load-jobs/load-job-types";

const plannedJob: LoadJob = {
  canScan: true,
  carrier: "Bestar Carrier",
  closedAt: null,
  completedAt: null,
  completedBy: null,
  completedById: null,
  container: null,
  containerId: null,
  createdAt: "2026-07-02T10:00:00.000Z",
  createdBy: null,
  createdById: null,
  destinationRegion: "YEG1",
  dockNo: "D1",
  eventCount: 0,
  externalPalletCount: 0,
  id: "load-job-planned",
  lines: [
    {
      container: { containerNo: "CSNU8877228", id: "container-1" },
      containerDestinationId: "destination-1",
      containerId: "container-1",
      containerNo: "CSNU8877228",
      createdAt: "2026-07-02T10:00:00.000Z",
      destinationCode: "YEG1",
      externalTransfer: false,
      id: "line-1",
      note: null,
      plannedPallets: 5,
      sequence: 1,
      sourceText: "CSNU8877228-5P",
      updatedAt: "2026-07-02T10:00:00.000Z",
    },
  ],
  loadNo: "LOAD-2026-001",
  palletCount: 2,
  plannedPalletCount: 5,
  scheduledDepartureAt: "2026-07-02T20:00:00.000Z",
  startedAt: null,
  status: "PLANNED",
  truckNo: "TRUCK-9",
  updatedAt: "2026-07-02T10:00:00.000Z",
};

const inProgressJob: LoadJob = {
  ...plannedJob,
  createdAt: "2026-07-02T11:00:00.000Z",
  id: "load-job-in-progress",
  loadNo: "LOAD-2026-002",
  status: "IN_PROGRESS",
};

test("listOpenLoadJobs reads planned and in-progress jobs from the real API routes", async () => {
  const requests: string[] = [];
  const result = await listOpenLoadJobs("http://api.local/api", "jwt-token", {
    fetcher: async (input, init) => {
      requests.push(String(input));
      assert.deepEqual(init?.headers, { authorization: "Bearer jwt-token" });
      if (String(input).includes("status=PLANNED")) {
        return new Response(
          JSON.stringify({ items: [plannedJob], limit: 50, offset: 0 }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ items: [inProgressJob], limit: 50, offset: 0 }),
        { status: 200 },
      );
    },
  });

  assert.deepEqual(requests, [
    "http://api.local/api/load-jobs?limit=50&status=PLANNED",
    "http://api.local/api/load-jobs?limit=50&status=IN_PROGRESS",
  ]);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["load-job-in-progress", "load-job-planned"],
  );
});

test("getLoadJob reads one real load job before opening the scan placeholder", async () => {
  const result = await getLoadJob("http://api.local/api", "jwt-token", "load job/1", {
    fetcher: async (input) => {
      assert.equal(
        String(input),
        "http://api.local/api/load-jobs/load%20job%2F1",
      );
      return new Response(JSON.stringify(plannedJob), { status: 200 });
    },
  });

  assert.equal(result.loadNo, "LOAD-2026-001");
});

test("updateLoadJob saves dock number through the protected patch route", async () => {
  const requests: Array<{ body?: string; headers: HeadersInit | undefined; method?: string; url: string }> = [];
  const result = await updateLoadJob(
    "http://api.local/api",
    "jwt-token",
    "load job/1",
    { dockNo: "D9" },
    {
      fetcher: async (input, init) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          headers: init?.headers,
          method: init?.method,
          url: String(input),
        });
        return new Response(JSON.stringify({ ...plannedJob, dockNo: "D9" }), {
          status: 200,
        });
      },
    },
  );

  assert.equal(requests[0]?.url, "http://api.local/api/load-jobs/load%20job%2F1");
  assert.equal(requests[0]?.method, "PATCH");
  assert.deepEqual(requests[0]?.headers, {
    authorization: "Bearer jwt-token",
    "content-type": "application/json",
  });
  assert.equal(requests[0]?.body, JSON.stringify({ dockNo: "D9" }));
  assert.equal(result.dockNo, "D9");
});

test("closeLoadJob completes loading through the protected close route", async () => {
  const requests: Array<{ body?: string; method?: string; url: string }> = [];
  const result = await closeLoadJob(
    "http://api.local/api",
    "jwt-token",
    "load job/1",
    {
      dockNo: "D9",
      note: "Completed from native scan app.",
      reason: "Warehouse loading completed.",
    },
    {
      fetcher: async (input, init) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          method: init?.method,
          url: String(input),
        });
        return new Response(
          JSON.stringify({
            ...plannedJob,
            completedAt: "2026-07-02T21:00:00.000Z",
            completedBy: {
              email: "warehouse@example.com",
              id: "user-warehouse",
              name: "Warehouse Operator",
              role: "WAREHOUSE",
            },
            completedById: "user-warehouse",
            dockNo: "D9",
            status: "COMPLETED",
          }),
          { status: 200 },
        );
      },
    },
  );

  assert.equal(
    requests[0]?.url,
    "http://api.local/api/load-jobs/load%20job%2F1/close",
  );
  assert.equal(requests[0]?.method, "POST");
  assert.equal(
    requests[0]?.body,
    JSON.stringify({
      dockNo: "D9",
      note: "Completed from native scan app.",
      reason: "Warehouse loading completed.",
    }),
  );
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.completedBy?.id, "user-warehouse");
});

test("load job view model displays backend progress fields without local inventory state", () => {
  assert.equal(loadJobDisplayName(plannedJob), "LOAD-2026-001");
  assert.deepEqual(loadJobProgress(plannedJob), {
    loaded: 2,
    planned: 5,
    remaining: 3,
  });
  assert.equal(formatNullable(null), "Not set");
  assert.equal(loadJobLineSummary(plannedJob), "CSNU8877228-5P");
});

test("Bay Board prioritizes in-progress, scannable, and scheduled load jobs using real fields", () => {
  const blockedInProgress = { ...inProgressJob, canScan: false, id: "blocked" };
  const laterPlanned = {
    ...plannedJob,
    id: "later",
    scheduledDepartureAt: "2026-07-03T20:00:00.000Z",
  };
  const earlierPlanned = {
    ...plannedJob,
    id: "earlier",
    scheduledDepartureAt: "2026-07-02T18:00:00.000Z",
  };

  assert.deepEqual(
    bayBoardJobs([laterPlanned, blockedInProgress, earlierPlanned, inProgressJob], "").map((job) => job.id),
    ["load-job-in-progress", "blocked", "earlier", "later"],
  );
  assert.ok(compareBayBoardJobs(inProgressJob, earlierPlanned) < 0);
});

test("Bay Board search only filters recognized operational fields", () => {
  assert.deepEqual(bayBoardJobs([plannedJob, inProgressJob], "truck-9").map((job) => job.id), ["load-job-in-progress", "load-job-planned"]);
  assert.deepEqual(bayBoardJobs([plannedJob, inProgressJob], "yeg1").map((job) => job.id), ["load-job-in-progress", "load-job-planned"]);
  assert.deepEqual(bayBoardJobs([plannedJob, inProgressJob], "missing").map((job) => job.id), []);
});

test("Bay Board keeps a stable order for 100 API load-job records", () => {
  const jobs = Array.from({ length: 100 }, (_, index) => ({
    ...plannedJob,
    createdAt: `2026-07-02T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
    id: `load-job-${String(index).padStart(3, "0")}`,
    loadNo: `LOAD-2026-${String(index).padStart(3, "0")}`,
    scheduledDepartureAt: `2026-07-${String((index % 27) + 1).padStart(2, "0")}T20:00:00.000Z`,
    status: index % 3 === 0 ? "IN_PROGRESS" : "PLANNED",
  }));

  const first = bayBoardJobs(jobs, "").map((job) => job.id);
  const second = bayBoardJobs(jobs, "").map((job) => job.id);
  assert.equal(first.length, 100);
  assert.deepEqual(first, second);
  assert.ok(first.slice(0, 34).every((id) => Number(id.slice(-3)) % 3 === 0));
});

test("load job client preserves API permission errors", async () => {
  await assert.rejects(
    () =>
      listOpenLoadJobs("http://api.local/api", "jwt-token", {
        fetcher: async () =>
          new Response(
            JSON.stringify({
              code: "FORBIDDEN",
              message: "Forbidden resource.",
            }),
            { status: 403 },
          ),
      }),
    (error) =>
      error instanceof NativeApiError &&
      error.code === "FORBIDDEN" &&
      error.status === 403,
  );
});
