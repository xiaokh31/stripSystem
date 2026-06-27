import test from "node:test";
import assert from "node:assert/strict";
import {
  createApiClient,
  createManualContainer,
  listImportFiles,
} from "../src/lib/api-client";

test("imports API client sends pagination to the import list endpoint", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));

    return new Response(
      JSON.stringify({
        items: [],
        limit: 25,
        offset: 50,
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await listImportFiles(
    { limit: 25, offset: 50 },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    "http://api.local/api/imports?limit=25&offset=50",
  ]);
  assert.deepEqual(result, { items: [], limit: 25, offset: 50 });
});

test("browser API client calls window fetch with the correct binding", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const fakeWindow = {
    fetch(
      this: unknown,
      input: Parameters<typeof fetch>[0],
    ) {
      assert.equal(this, fakeWindow);
      requests.push(input instanceof Request ? input.url : String(input));

      return Promise.resolve(
        new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    },
  };

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: fakeWindow,
    });
    globalThis.fetch = fakeWindow.fetch as typeof fetch;

    const result = await createApiClient({ baseUrl: "/api" }).get<{
      status: string;
    }>("/health");

    assert.deepEqual(requests, ["/api/health"]);
    assert.deepEqual(result, { status: "ok" });
  } finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  }
});

test("manual container API client posts to the real correction endpoint", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        container: {
          id: "container-manual",
          importFileId: null,
          containerNo: "MANU1234567",
          dockNo: "D7",
          company: "Manual Customer",
          sourceFormat: "UNKNOWN",
          parserVersion: "manual-entry-v1",
          status: "CORRECTED",
          totalCartons: 36,
          totalVolumeCbm: "0.000",
          rawJson: {},
          warnings: [],
          errors: [],
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
          destinations: [],
        },
        corrections: [],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 201,
      },
    );
  };

  const result = await createManualContainer(
    {
      containerNo: "MANU1234567",
      destinations: [
        {
          cartons: 36,
          destinationCode: "YEG1",
          pallets: 4,
        },
      ],
      reason: "Original workbook could not be parsed.",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.equal(result.container.importFileId, null);
  assert.deepEqual(requests, [
    {
      body: {
        containerNo: "MANU1234567",
        destinations: [
          {
            cartons: 36,
            destinationCode: "YEG1",
            pallets: 4,
          },
        ],
        reason: "Original workbook could not be parsed.",
      },
      method: "POST",
      url: "http://api.local/api/containers/manual",
    },
  ]);
});
