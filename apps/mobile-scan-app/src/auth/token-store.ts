import type { AuthUser } from "./auth-types";

export interface SecureTokenStore {
  clearToken(): Promise<void>;
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  getSession(): Promise<NativeStoredSession | null>;
  setSession(session: NativeStoredSession): Promise<void>;
}

export interface NativeStoredSession {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  sessionId: string;
  user: AuthUser | null;
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
    const session = parseStoredSession(token);
    return session?.accessToken ?? (token.trim() ? token : null);
  }

  async setToken(token: string): Promise<void> {
    if (!token.trim()) {
      throw new Error("Cannot persist an empty auth token.");
    }
    await this.nativeModule.setToken(token);
  }

  async getSession(): Promise<NativeStoredSession | null> {
    const token = await this.nativeModule.getToken();
    return typeof token === "string" ? parseStoredSession(token) : null;
  }

  async setSession(session: NativeStoredSession): Promise<void> {
    assertStoredSession(session);
    await this.nativeModule.setToken(JSON.stringify(session));
  }
}

export class MemorySecureTokenStore implements SecureTokenStore {
  constructor(private token: string | null = null) {}

  async clearToken(): Promise<void> {
    this.token = null;
  }

  async getToken(): Promise<string | null> {
    return parseStoredSession(this.token)?.accessToken ?? this.token;
  }

  async setToken(token: string): Promise<void> {
    if (!token.trim()) {
      throw new Error("Cannot persist an empty auth token.");
    }
    this.token = token;
  }

  async getSession(): Promise<NativeStoredSession | null> {
    return parseStoredSession(this.token);
  }

  async setSession(session: NativeStoredSession): Promise<void> {
    assertStoredSession(session);
    this.token = JSON.stringify(session);
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

  async getSession(): Promise<NativeStoredSession | null> {
    throw new Error(this.message);
  }

  async setSession(): Promise<void> {
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

export function parseStoredSession(value: string | null): NativeStoredSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<NativeStoredSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.sessionId !== "string"
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      accessExpiresAt:
        typeof parsed.accessExpiresAt === "string"
          ? parsed.accessExpiresAt
          : new Date(0).toISOString(),
      refreshToken: parsed.refreshToken,
      refreshExpiresAt:
        typeof parsed.refreshExpiresAt === "string"
          ? parsed.refreshExpiresAt
          : new Date(0).toISOString(),
      sessionId: parsed.sessionId,
      user: isAuthUser(parsed.user) ? parsed.user : null,
    };
  } catch { return null; }
}

function assertStoredSession(session: NativeStoredSession): void {
  if (
    !session.accessToken.trim() ||
    !session.refreshToken.trim() ||
    !session.sessionId.trim() ||
    !Number.isFinite(Date.parse(session.accessExpiresAt)) ||
    !Number.isFinite(Date.parse(session.refreshExpiresAt))
  ) {
    throw new Error("Cannot persist an incomplete native auth session.");
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as AuthUser).id === "string" &&
    Array.isArray((value as AuthUser).roles) &&
    Array.isArray((value as AuthUser).permissions)
  );
}
