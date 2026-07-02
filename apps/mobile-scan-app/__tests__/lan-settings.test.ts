import test from "node:test";
import assert from "node:assert/strict";
import { checkApiHealth } from "../src/api/health-client";
import { buildHealthUrl, normalizeApiBaseUrl } from "../src/config/api-base-url";
import {
  apiBaseUrlStorageKey,
  defaultApiBaseUrl,
  loadLanSettings,
  saveApiBaseUrl,
} from "../src/config/lan-settings";
import {
  createDeviceId,
  deviceIdStorageKey,
  getOrCreateDeviceId,
} from "../src/device/device-id";
import { MemorySettingsStore } from "../src/storage/settings-store";

test("normalizes LAN API base URLs without using browser-only behavior", () => {
  assert.deepEqual(normalizeApiBaseUrl(" http://192.168.1.10/api/ "), {
    ok: true,
    value: "http://192.168.1.10/api",
  });
  assert.deepEqual(normalizeApiBaseUrl("https://warehouse-server.local"), {
    ok: true,
    value: "https://warehouse-server.local/api",
  });
  assert.deepEqual(normalizeApiBaseUrl("ftp://warehouse-server.local/api"), {
    message: "API base URL must use http or https.",
    ok: false,
  });
});

test("builds the real health endpoint under the configured API base URL", () => {
  assert.deepEqual(buildHealthUrl("http://127.0.0.1/api"), {
    ok: true,
    value: "http://127.0.0.1/api/health",
  });
});

test("checks API health through the configured fetcher", async () => {
  const requests: string[] = [];
  const result = await checkApiHealth(" http://api.local/api ", {
    fetcher: async (input) => {
      requests.push(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    now: () => new Date("2026-07-02T12:00:00.000Z"),
  });

  assert.deepEqual(requests, ["http://api.local/api/health"]);
  assert.deepEqual(result, {
    checkedAt: "2026-07-02T12:00:00.000Z",
    message: "API is reachable.",
    ok: true,
    status: 200,
  });
});

test("persists LAN API base URL in the app settings store", async () => {
  const store = new MemorySettingsStore();

  assert.deepEqual(await loadLanSettings(store), {
    apiBaseUrl: defaultApiBaseUrl,
  });

  await saveApiBaseUrl(store, "https://warehouse-server.local/");

  assert.equal(
    await store.getItem(apiBaseUrlStorageKey),
    "https://warehouse-server.local/api",
  );
});

test("creates and reuses a stable native scan device id", async () => {
  const store = new MemorySettingsStore();
  const now = () => new Date("2026-07-02T12:00:00.000Z");
  const first = await getOrCreateDeviceId(store, () => 0.25, now);
  const second = await getOrCreateDeviceId(store, () => 0.99, now);

  assert.equal(first, second);
  assert.equal(await store.getItem(deviceIdStorageKey), first);
  assert.match(first, /^bestar-scan-/u);
});

test("device id generation is deterministic when random and time are injected", () => {
  assert.equal(
    createDeviceId(() => 0, () => new Date("2026-07-02T00:00:00.000Z")),
    "bestar-scan-mr2qmtc0-0000000",
  );
});
