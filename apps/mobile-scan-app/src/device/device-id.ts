import type { SettingsStore } from "../storage/settings-store";

export const deviceIdStorageKey = "bestar.mobileScan.deviceId";

export function createDeviceId(random = Math.random, now = () => new Date()) {
  const timePart = now().getTime().toString(36);
  const randomPart = Math.floor(random() * 0xffffffff)
    .toString(36)
    .padStart(7, "0");
  return `bestar-scan-${timePart}-${randomPart}`;
}

export async function getOrCreateDeviceId(
  store: SettingsStore,
  random?: () => number,
  now?: () => Date,
): Promise<string> {
  const existing = await store.getItem(deviceIdStorageKey);
  if (existing) {
    return existing;
  }

  const created = createDeviceId(random, now);
  await store.setItem(deviceIdStorageKey, created);
  return created;
}
