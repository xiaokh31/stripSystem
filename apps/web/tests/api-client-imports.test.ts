import test from "node:test";
import assert from "node:assert/strict";
import {
  createApiClient,
  createManualContainer,
  deleteContainerDestination,
  generateContainerLabels,
  generateContainerReport,
  listCorrections,
  listImportFiles,
  updateContainer,
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

test("destination API client deletes through the real destination endpoint", async () => {
  const requests: Array<{ method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    return new Response(
      JSON.stringify({
        containerDestination: {
          calculatedPallets: 4,
          cartons: 40,
          containerId: "container-1",
          destinationCode: "YYZ",
          destinationType: "AMAZON_FBA",
          finalPallets: 4,
          id: "destination-1",
          manualPallets: null,
          note: null,
          updatedAt: "2026-06-27T00:00:00.000Z",
          volume: "5.250",
        },
        corrections: [],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await deleteContainerDestination("destination-1", {
    baseUrl: "http://api.local/api",
    fetcher,
  });

  assert.equal(result.containerDestination.id, "destination-1");
  assert.deepEqual(requests, [
    {
      method: "DELETE",
      url: "http://api.local/api/container-destinations/destination-1",
    },
  ]);
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

test("container generation API client posts to report and label endpoints", async () => {
  const requests: Array<{ method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({
      method: init?.method ?? "GET",
      url,
    });

    return new Response(
      JSON.stringify({
        generatedFile: {
          id: url.endsWith("/generate-report") ? "report-file" : "label-file",
          importFileId: null,
          containerId: "container manual/1",
          fileType: url.endsWith("/generate-report")
            ? "EXCEL_REPORT"
            : "PALLET_LABEL_PDF",
          storagePath: "/storage/generated-file",
          fileSha256: "sha",
          mimeType: url.endsWith("/generate-report")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
          fileSizeBytes: "100",
          status: "GENERATED",
          errorMessage: null,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        pallets: [],
        warnings: [],
        errors: [],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 201,
      },
    );
  };

  const report = await generateContainerReport("container manual/1", {
    baseUrl: "http://api.local/api",
    fetcher,
  });
  const labels = await generateContainerLabels("container manual/1", {
    baseUrl: "http://api.local/api",
    fetcher,
  });

  assert.equal(report.generatedFile.fileType, "EXCEL_REPORT");
  assert.equal(labels.generatedFile.fileType, "PALLET_LABEL_PDF");
  assert.deepEqual(requests, [
    {
      method: "POST",
      url: "http://api.local/api/containers/container%20manual%2F1/generate-report",
    },
    {
      method: "POST",
      url: "http://api.local/api/containers/container%20manual%2F1/generate-labels",
    },
  ]);
});

test("container status API client patches the container endpoint", async () => {
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
          id: "container-1",
          importFileId: "import-1",
          containerNo: "CSNU8877228",
          dockNo: null,
          company: null,
          status: "PARSED",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        corrections: [],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await updateContainer(
    "container-1",
    {
      correctionNote: "Reset after test generation",
      status: "PARSED",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.equal(result.container.status, "PARSED");
  assert.deepEqual(requests, [
    {
      body: {
        correctionNote: "Reset after test generation",
        status: "PARSED",
      },
      method: "PATCH",
      url: "http://api.local/api/containers/container-1",
    },
  ]);
});

test("correction history API client sends container filters", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));

    return new Response(
      JSON.stringify({
        items: [],
        limit: 100,
        offset: 0,
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  const result = await listCorrections(
    {
      containerId: "container 1",
      limit: 100,
      offset: 0,
      targetType: "CONTAINER_DESTINATION",
    },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    "http://api.local/api/corrections?containerId=container+1&limit=100&offset=0&targetType=CONTAINER_DESTINATION",
  ]);
  assert.deepEqual(result, { items: [], limit: 100, offset: 0 });
});
