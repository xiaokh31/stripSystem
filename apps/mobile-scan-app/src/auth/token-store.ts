import type { SettingsStore } from "../storage/settings-store";

export const authTokenStorageKey = "bestar.mobileScan.authToken";

export interface SecureTokenStore {
  clearToken(): Promise<void>;
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
}

export class AsyncStorageTokenStore implements SecureTokenStore {
  constructor(private readonly store: SettingsStore) {}

  clearToken(): Promise<void> {
    return this.store.removeItem(authTokenStorageKey);
  }

  getToken(): Promise<string | null> {
    return this.store.getItem(authTokenStorageKey);
  }

  setToken(token: string): Promise<void> {
    return this.store.setItem(authTokenStorageKey, token);
  }
}
