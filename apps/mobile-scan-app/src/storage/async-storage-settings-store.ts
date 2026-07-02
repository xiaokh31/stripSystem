import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SettingsStore } from "./settings-store";

export class AsyncStorageSettingsStore implements SettingsStore {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }
}
