import assert from "node:assert/strict";
import test from "node:test";
import { getOperationsDashboard } from "../src/lib/api-client";

test("getOperationsDashboard calls the operations dashboard endpoint", async () => {
  const urls: string[] = [];
  const dashboard = await getOperationsDashboard(
    { month: "2026-07", range: "7d" },
    {
      authToken: "token",
      baseUrl: "http://api.test/api",
      fetcher: async (input, init) => {
        urls.push(String(input));
        assert.equal(init?.headers instanceof Headers, true);
        assert.equal(
          (init?.headers as Headers).get("Authorization"),
          "Bearer token",
        );
        return Response.json({
          containerLifecycle: { stages: [], totalContainers: 0 },
          exceptionQueue: [],
          generatedAt: "2026-07-10T12:00:00.000Z",
          health: { apiStatus: "ok", databaseStatus: "up", version: "0.0.1" },
          hiddenSections: [],
          inventory: null,
          loadJobs: null,
          month: "2026-07",
          monthlySummary: null,
          range: "7d",
          recentActivity: [],
          timeZone: "America/Edmonton",
          wageAndAttendance: null,
          workQueue: { items: [], totalActions: 0 },
        });
      },
    },
  );

  assert.equal(
    urls[0],
    "http://api.test/api/dashboard/operations?range=7d&month=2026-07",
  );
  assert.equal(dashboard.range, "7d");
});
