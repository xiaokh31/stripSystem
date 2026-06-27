import test from "node:test";
import assert from "node:assert/strict";
import {
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
