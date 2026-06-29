import test from "node:test";
import assert from "node:assert/strict";
import {
  buildApiUrl,
  getApiBaseUrl,
  getGeneratedFileDownloadUrl,
  getPublicApiBaseUrl,
  getContainerInventorySummary,
  getDestinationInventory,
} from "../src/lib/api-client";

test("inventory API client sends filters to report endpoints", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));

    return new Response(JSON.stringify({ items: [] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  await getContainerInventorySummary(
    {
      containerNo: " CSNU8877228 ",
      destinationCode: " YEG1 ",
      status: "LABEL_PRINTED",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );
  await getDestinationInventory(
    { status: "LOADED" },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    "http://api.local/api/reports/container-summary?containerNo=CSNU8877228&destinationCode=YEG1&status=LABEL_PRINTED",
    "http://api.local/api/reports/inventory?status=LOADED",
  ]);
});

test("browser API base defaults to same-origin api path", () => {
  const env = preserveApiEnv();
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );

  try {
    clearApiEnv();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    assert.equal(getApiBaseUrl(), "/api");
    assert.equal(buildApiUrl("/imports"), "/api/imports");
  } finally {
    restoreApiEnv(env);
    restoreWindow(windowDescriptor);
  }
});

test("server API base defaults to local API dev server", () => {
  const env = preserveApiEnv();
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );

  try {
    clearApiEnv();
    delete (globalThis as Record<string, unknown>).window;

    assert.equal(getApiBaseUrl(), "http://127.0.0.1:4000/api");
    assert.equal(
      buildApiUrl("/health"),
      "http://127.0.0.1:4000/api/health",
    );
  } finally {
    restoreApiEnv(env);
    restoreWindow(windowDescriptor);
  }
});

test("generated file download urls use the browser-visible web route during SSR", () => {
  const env = preserveApiEnv();
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );

  try {
    clearApiEnv();
    delete (globalThis as Record<string, unknown>).window;

    assert.equal(getPublicApiBaseUrl(), "/api");
    assert.equal(
      getGeneratedFileDownloadUrl("container manual/1", "report file/1"),
      "/containers/container%20manual%2F1/files/report%20file%2F1/download",
    );
  } finally {
    restoreApiEnv(env);
    restoreWindow(windowDescriptor);
  }
});

test("generated file download urls honor explicit public api base urls", () => {
  assert.equal(
    getGeneratedFileDownloadUrl(
      "container-1",
      "file-1",
      "http://warehouse.local/api/",
    ),
    "http://warehouse.local/containers/container-1/files/file-1/download",
  );
});

function preserveApiEnv() {
  return {
    API_BASE_URL: process.env.API_BASE_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_SERVER_API_BASE_URL: process.env.NEXT_SERVER_API_BASE_URL,
  };
}

function clearApiEnv() {
  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  delete process.env.NEXT_SERVER_API_BASE_URL;
}

function restoreApiEnv(env: ReturnType<typeof preserveApiEnv>) {
  restoreEnvValue("API_BASE_URL", env.API_BASE_URL);
  restoreEnvValue("NEXT_PUBLIC_API_BASE_URL", env.NEXT_PUBLIC_API_BASE_URL);
  restoreEnvValue("NEXT_SERVER_API_BASE_URL", env.NEXT_SERVER_API_BASE_URL);
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function restoreWindow(descriptor: PropertyDescriptor | undefined) {
  if (descriptor) {
    Object.defineProperty(globalThis, "window", descriptor);
    return;
  }

  delete (globalThis as Record<string, unknown>).window;
}
