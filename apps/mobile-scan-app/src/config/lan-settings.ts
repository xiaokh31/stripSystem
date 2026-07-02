import { checkApiHealth, type HealthCheckResult } from "../api/health-client";
import { normalizeApiBaseUrl } from "./api-base-url";
import type { SettingsStore } from "../storage/settings-store";

export const apiBaseUrlStorageKey = "bestar.mobileScan.apiBaseUrl";
export const defaultApiBaseUrl = "http://127.0.0.1/api";

export interface LanSettings {
  apiBaseUrl: string;
}

export async function loadLanSettings(
  store: SettingsStore,
): Promise<LanSettings> {
  return {
    apiBaseUrl: (await store.getItem(apiBaseUrlStorageKey)) ?? defaultApiBaseUrl,
  };
}

export async function saveApiBaseUrl(
  store: SettingsStore,
  apiBaseUrl: string,
): Promise<LanSettings> {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  if (!normalized.ok) {
    throw new Error(normalized.message);
  }

  await store.setItem(apiBaseUrlStorageKey, normalized.value);
  return { apiBaseUrl: normalized.value };
}

export async function saveAndCheckApiBaseUrl(
  store: SettingsStore,
  apiBaseUrl: string,
): Promise<HealthCheckResult & LanSettings> {
  const settings = await saveApiBaseUrl(store, apiBaseUrl);
  const health = await checkApiHealth(settings.apiBaseUrl);

  return { ...health, apiBaseUrl: settings.apiBaseUrl };
}
