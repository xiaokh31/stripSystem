import { getCurrentUser, nativeLogin, refreshNativeSession, revokeNativeSession } from "../api/auth-client";
import { NativeApiError } from "../api/api-error";
import type { AuthUser, AuthStatus } from "./auth-types";
import { canUseMobileScan } from "./mobile-permissions";
import type { NativeStoredSession, SecureTokenStore } from "./token-store";

export interface AuthSession {
  message: string;
  status: AuthStatus;
  user: AuthUser | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RestoreSessionOptions {
  apiBaseUrl: string;
  fetcher?: typeof fetch;
  tokenStore: SecureTokenStore;
}

export async function restoreSession(
  options: RestoreSessionOptions,
): Promise<AuthSession> {
  let token: string | null;
  try {
    token = await options.tokenStore.getToken();
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Could not restore session.",
      status: "error",
      user: null,
    };
  }

  const storedSession = await options.tokenStore.getSession?.();
  if (!token) {
    return {
      message: "Sign in with an existing warehouse account.",
      status: "logged_out",
      user: null,
    };
  }

  try {
    const user = await getCurrentUser(options.apiBaseUrl, token, {
      fetcher: options.fetcher,
    });
    return toAuthenticatedSession(user);
  } catch (error) {
    if (isSessionExpired(error)) {
      if (storedSession) {
        try {
          const refreshed = await refreshNativeSession(options.apiBaseUrl, storedSession.refreshToken, { fetcher: options.fetcher });
          await saveNativeSession(options.tokenStore, refreshed);
          return toAuthenticatedSession(refreshed.user);
        } catch (refreshError) {
          if (!isNetworkFailure(refreshError)) await options.tokenStore.clearToken();
          return { message: isNetworkFailure(refreshError) ? "Offline. Session will be checked when connection returns." : "Session expired. Sign in again.", status: isNetworkFailure(refreshError) ? "error" : "session_expired", user: null };
        }
      }
      await options.tokenStore.clearToken();
      return {
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      };
    }

    return {
      message: error instanceof Error ? error.message : "Could not restore session.",
      status: "error",
      user: null,
    };
  }
}

export async function signIn(
  apiBaseUrl: string,
  credentials: LoginCredentials & { deviceId?: string; platform?: string; appVersion?: string },
  tokenStore: SecureTokenStore,
  options: { fetcher?: typeof fetch } = {},
): Promise<AuthSession> {
  const result = await nativeLogin(apiBaseUrl, { ...credentials, deviceId: credentials.deviceId ?? "unknown-native-device" }, {
    fetcher: options.fetcher,
  });
  await saveNativeSession(tokenStore, result);
  return toAuthenticatedSession(result.user);
}

async function saveNativeSession(tokenStore: SecureTokenStore, result: { accessToken: string; refreshToken?: string; sessionId?: string }): Promise<void> {
  if (!result.refreshToken || !result.sessionId) {
    await tokenStore.setToken(result.accessToken);
    return;
  }
  const session: NativeStoredSession = { accessToken: result.accessToken, refreshToken: result.refreshToken, sessionId: result.sessionId };
  if (tokenStore.setSession) return tokenStore.setSession(session);
  await tokenStore.setToken(session.accessToken);
}

function isNetworkFailure(error: unknown): boolean { return !(error instanceof NativeApiError); }

export async function signOut(tokenStore: SecureTokenStore, apiBaseUrl?: string): Promise<AuthSession> {
  const session = await tokenStore.getSession?.();
  if (apiBaseUrl && session) {
    try { await revokeNativeSession(apiBaseUrl, session.refreshToken); } catch { /* Offline logout still clears local secure storage. */ }
  }
  await tokenStore.clearToken();
  return {
    message: "Signed out.",
    status: "logged_out",
    user: null,
  };
}

function toAuthenticatedSession(user: AuthUser): AuthSession {
  if (!canUseMobileScan(user)) {
    return {
      message:
        "Permission denied. This account needs load job read and scan permissions.",
      status: "permission_denied",
      user,
    };
  }

  return {
    message: "Authenticated. Scan workflow will be available in the next task.",
    status: "authenticated",
    user,
  };
}

function isSessionExpired(error: unknown): boolean {
  return (
    error instanceof NativeApiError &&
    (error.status === 401 || error.code === "UNAUTHENTICATED")
  );
}
