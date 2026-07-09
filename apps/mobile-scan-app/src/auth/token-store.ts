export interface SecureTokenStore {
  clearToken(): Promise<void>;
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
}

interface NativeSecureTokenStoreModule {
  clearToken(): Promise<void>;
  getToken(): Promise<unknown>;
  setToken(token: string): Promise<void>;
}

export interface NativeSecureTokenModuleMap {
  BestarSecureTokenStore?: NativeSecureTokenStoreModule | null;
}

export class NativeSecureTokenStore implements SecureTokenStore {
  constructor(private readonly nativeModule: NativeSecureTokenStoreModule) {}

  async clearToken(): Promise<void> {
    await this.nativeModule.clearToken();
  }

  async getToken(): Promise<string | null> {
    const token = await this.nativeModule.getToken();
    if (token == null) {
      return null;
    }
    if (typeof token !== "string") {
      throw new Error("Secure token storage returned a non-string auth token.");
    }
    return token.trim() ? token : null;
  }

  async setToken(token: string): Promise<void> {
    if (!token.trim()) {
      throw new Error("Cannot persist an empty auth token.");
    }
    await this.nativeModule.setToken(token);
  }
}

export class MemorySecureTokenStore implements SecureTokenStore {
  constructor(private token: string | null = null) {}

  async clearToken(): Promise<void> {
    this.token = null;
  }

  async getToken(): Promise<string | null> {
    return this.token;
  }

  async setToken(token: string): Promise<void> {
    if (!token.trim()) {
      throw new Error("Cannot persist an empty auth token.");
    }
    this.token = token;
  }
}

class UnavailableSecureTokenStore implements SecureTokenStore {
  constructor(private readonly message: string) {}

  async clearToken(): Promise<void> {
    throw new Error(this.message);
  }

  async getToken(): Promise<string | null> {
    throw new Error(this.message);
  }

  async setToken(): Promise<void> {
    throw new Error(this.message);
  }
}

export function createNativeSecureTokenStore(
  nativeModules: NativeSecureTokenModuleMap = loadReactNativeModules(),
): SecureTokenStore {
  const nativeModule = nativeModules.BestarSecureTokenStore;
  if (
    typeof nativeModule?.getToken !== "function" ||
    typeof nativeModule.setToken !== "function" ||
    typeof nativeModule.clearToken !== "function"
  ) {
    return new UnavailableSecureTokenStore(
      "BestarSecureTokenStore native module is not installed; secure token storage is required in production builds.",
    );
  }
  return new NativeSecureTokenStore(nativeModule);
}

function loadReactNativeModules(): NativeSecureTokenModuleMap {
  const reactNative = require("react-native") as {
    NativeModules?: NativeSecureTokenModuleMap;
  };
  return reactNative.NativeModules ?? {};
}
