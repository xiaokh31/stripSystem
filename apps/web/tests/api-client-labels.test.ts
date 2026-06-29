import test from "node:test";
import assert from "node:assert/strict";
import {
  reprintContainerLabels,
  reprintPalletLabel,
} from "../src/lib/api-client";

test("label reprint API client posts audit reasons to real endpoints", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({
      body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      method: init?.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
    });

    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/labels/reprint")) {
      return jsonResponse({
        containerId: "container 1",
        eventCount: 2,
        events: [
          reprintEvent({ id: "event-1", palletRecordId: "pallet-1" }),
          reprintEvent({ id: "event-2", palletRecordId: "pallet-2" }),
        ],
      });
    }

    return jsonResponse({
      event: reprintEvent({ id: "event-3", palletRecordId: "pallet 1" }),
      pallet: {
        containerDestinationId: "destination-1",
        containerId: "container 1",
        createdAt: "2026-06-27T12:00:00.000Z",
        destinationCode: "YYZ",
        destinationType: "AMAZON_FBA",
        id: "pallet 1",
        labelPrintedAt: "2026-06-27T12:00:00.000Z",
        palletId: "PALLET-001",
        palletNo: 1,
        qrPayload: "SSP1|PALLET|2026-06-27|CSNU8877228|YYZ|1|PALLET-001",
        status: "LOADED",
        updatedAt: "2026-06-27T12:00:00.000Z",
      },
    });
  };

  const containerResult = await reprintContainerLabels(
    "container 1",
    { reason: "Printer jam damaged the first packet." },
    { baseUrl: "http://api.local/api", fetcher },
  );
  const palletResult = await reprintPalletLabel(
    "pallet 1",
    { reason: "Single pallet label torn.", supervisorOverride: true },
    { baseUrl: "http://api.local/api", fetcher },
  );

  assert.deepEqual(requests, [
    {
      body: { reason: "Printer jam damaged the first packet." },
      method: "POST",
      url: "http://api.local/api/containers/container%201/labels/reprint",
    },
    {
      body: {
        reason: "Single pallet label torn.",
        supervisorOverride: true,
      },
      method: "POST",
      url: "http://api.local/api/pallets/pallet%201/print",
    },
  ]);
  assert.equal(containerResult.eventCount, 2);
  assert.equal(palletResult.event.userId, "auth-office");
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function reprintEvent(overrides: {
  id: string;
  palletRecordId: string;
}) {
  return {
    businessPalletId: "PALLET-001",
    id: overrides.id,
    palletRecordId: overrides.palletRecordId,
    palletStatus: "LOADED",
    printedAt: "2026-06-27T12:05:00.000Z",
    reason: "Printer jam damaged the first packet.",
    supervisorOverride: false,
    userId: "auth-office",
  };
}
