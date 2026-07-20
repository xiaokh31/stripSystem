import assert from "node:assert/strict";
import test from "node:test";
import {
  correctParserProfileReview,
  decideParserProfileReview,
  getParserProfileReview,
} from "../src/lib/api-client";

test("parser profile review client uses explicit protected decision commands", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      method: init?.method ?? "GET",
      url,
    });
    return new Response(
      JSON.stringify({
        id: "review-1",
        importFileId: "import 1",
        status: "PENDING",
        revision: 0,
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };
  const options = { baseUrl: "http://api.local/api", fetcher };

  await getParserProfileReview("import 1", options);
  await decideParserProfileReview(
    "import 1",
    "accept",
    { expectedRevision: 0 },
    options,
  );
  await correctParserProfileReview(
    "import 1",
    {
      expectedRevision: 0,
      reason: "Corrected destination",
      canonicalResult: {
        containerNo: "TEST1234567",
        lines: [
          {
            rowNumber: 3,
            included: true,
            destinationCode: "YEG1",
            cartons: 10,
            volumeCbm: "1.200",
            packageType: "CARTON",
            deliveryMethod: null,
            waybillNo: null,
            referenceNo: null,
            poNumber: null,
          },
        ],
      },
    },
    options,
  );
  await decideParserProfileReview(
    "import 1",
    "reject",
    { expectedRevision: 0, reason: "Wrong layout" },
    options,
  );

  assert.deepEqual(
    requests.map(({ method, url }) => ({ method, url })),
    [
      { method: "GET", url: "http://api.local/api/imports/import%201/profile-review" },
      { method: "POST", url: "http://api.local/api/imports/import%201/profile-review/accept" },
      { method: "POST", url: "http://api.local/api/imports/import%201/profile-review/correct" },
      { method: "POST", url: "http://api.local/api/imports/import%201/profile-review/reject" },
    ],
  );
  assert.deepEqual(requests[1]?.body, { expectedRevision: 0 });
  assert.equal(
    (requests[2]?.body as { reason: string }).reason,
    "Corrected destination",
  );
  assert.deepEqual(requests[3]?.body, {
    expectedRevision: 0,
    reason: "Wrong layout",
  });
});
