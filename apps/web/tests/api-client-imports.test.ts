import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient, listImportFiles } from "../src/lib/api-client";

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
