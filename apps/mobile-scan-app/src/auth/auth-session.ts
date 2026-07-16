import {
  getCurrentUser,
  nativeLogin,
  refreshNativeSession,
  revokeNativeSession,
} from "../api/auth-client";
import { NativeApiError } from "../api/api-error";
import type {
  AuthStatus,
  AuthUser,
  NativeSessionResponse,
} from "./auth-types";
import { canUseMobileScan } from "./mobile-permissions";
import type { NativeStoredSession, SecureTokenStore } from "./token-store";

const refreshFlights = new WeakMap<
  SecureTokenStore,
  Promise<NativeStoredSession>
>();
const accessRefreshWindowMs = 60_000;

export interface AuthSession {
  code: AuthMessageCode;
  message: string;
  status: AuthStatus;
  user: AuthUser | null;
}

export type AuthMessageCode =
  | "AUTHENTICATED"
  | "AUTH_RESTORE_FAILED"
  | "AUTH_RESTORING"
  | "AUTH_SESSION_OFFLINE"
  | "AUTH_SESSION_REVOKED"
  | "AUTH_SIGNED_OUT"
  | "AUTH_SIGN_IN_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "PERMISSION_DENIED"
  | "SYSTEM_USER_LOGIN_NOT_ALLOWED"
  | "USER_INACTIVE";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RestoreSessionOptions {
  apiBaseUrl: string;
  fetcher?: typeof fetch;
  tokenStore: SecureTokenStore;
}

export interface NativeSessionExecutionOptions extends RestoreSessionOptions {
  onSessionUpdated?(session: AuthSession): void;
}

export async function restoreSession(
  options: RestoreSessionOptions,
): Promise<AuthSession> {
  let storedSession: NativeStoredSession | null;
  try {
    storedSession = await options.tokenStore.getSession();
  } catch {
    return authState("AUTH_RESTORE_FAILED", "error", null);
  }

  if (!storedSession) {
    return authState("AUTH_SIGN_IN_REQUIRED", "logged_out", null);
  }

  if (accessNeedsRefresh(storedSession)) {
    return restoreByRefresh(options, storedSession);
  }

  try {
    const user = await getCurrentUser(
      options.apiBaseUrl,
      storedSession.accessToken,
      { fetcher: options.fetcher },
    );
    const current = { ...storedSession, user };
    await options.tokenStore.setSession(current);
    return toAuthenticatedSession(user);
  } catch (error) {
    if (shouldRefreshAccessToken(error)) {
      return restoreByRefresh(options, storedSession);
    }
    if (isInvalidSessionError(error)) {
      await options.tokenStore.clearToken();
      return invalidAuthState(error);
    }
    if (isNetworkFailure(error) && storedSession.user) {
      return authState(
        "AUTH_SESSION_OFFLINE",
        "offline",
        storedSession.user,
      );
    }
    return authState("AUTH_RESTORE_FAILED", "error", null);
  }
}

export async function signIn(
  apiBaseUrl: string,
  credentials: LoginCredentials & {
    deviceId?: string;
    platform?: string;
    appVersion?: string;
  },
  tokenStore: SecureTokenStore,
  options: { fetcher?: typeof fetch } = {},
): Promise<AuthSession> {
  const result = await nativeLogin(
    apiBaseUrl,
    {
      ...credentials,
      deviceId: credentials.deviceId ?? "unknown-native-device",
    },
    { fetcher: options.fetcher },
  );
  await saveNativeSession(tokenStore, result);
  return toAuthenticatedSession(result.user);
}

export async function signOut(
  tokenStore: SecureTokenStore,
  apiBaseUrl?: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<AuthSession> {
  let session: NativeStoredSession | null = null;
  try {
    session = await tokenStore.getSession();
  } catch {
    // Clearing the platform secure store remains the authoritative local logout.
  }
  if (apiBaseUrl && session) {
    try {
      await revokeNativeSession(apiBaseUrl, session.refreshToken, {
        fetcher: options.fetcher,
      });
    } catch {
      // Offline logout still removes every locally usable credential immediately.
    }
  }
  await tokenStore.clearToken();
  return authState("AUTH_SIGNED_OUT", "logged_out", null);
}

export async function withNativeSession<T>(
  options: NativeSessionExecutionOptions,
  operation: (accessToken: string) => Promise<T>,
): Promise<T> {
  let session = await requiredStoredSession(options.tokenStore);

  if (accessNeedsRefresh(session)) {
    try {
      session = await refreshStoredSession(options);
      options.onSessionUpdated?.(toAuthenticatedSession(session.user));
    } catch (error) {
      await clearInvalidSession(options.tokenStore, error);
      if (isInvalidSessionError(error) || accessIsExpired(session)) {
        throw error;
      }
    }
  }

  try {
    return await operation(session.accessToken);
  } catch (error) {
    if (!shouldRefreshAccessToken(error)) {
      await clearInvalidSession(options.tokenStore, error);
      throw error;
    }
  }

  const refreshed = await refreshStoredSession(options).catch(async (error) => {
    await clearInvalidSession(options.tokenStore, error);
    throw error;
  });
  options.onSessionUpdated?.(toAuthenticatedSession(refreshed.user));
  return operation(refreshed.accessToken);
}

export function toAuthenticatedSession(user: AuthUser | null): AuthSession {
  if (!user || !canUseMobileScan(user)) {
    return authState("PERMISSION_DENIED", "permission_denied", user);
  }
  return authState("AUTHENTICATED", "authenticated", user);
}

export async function saveNativeSession(
  tokenStore: SecureTokenStore,
  result: NativeSessionResponse,
): Promise<NativeStoredSession> {
  if (
    !result.refreshToken ||
    !result.sessionId ||
    !result.accessExpiresAt ||
    !result.refreshExpiresAt
  ) {
    throw new Error("Native login did not return a complete refresh session.");
  }
  const session: NativeStoredSession = {
    accessToken: result.accessToken,
    accessExpiresAt: result.accessExpiresAt,
    refreshToken: result.refreshToken,
    refreshExpiresAt: result.refreshExpiresAt,
    sessionId: result.sessionId,
    user: result.user,
  };
  await tokenStore.setSession(session);
  return session;
}

export function isInvalidSessionError(error: unknown): boolean {
  return (
    error instanceof NativeApiError &&
    [
      "AUTH_REFRESH_EXPIRED",
      "AUTH_REFRESH_REPLAYED",
      "AUTH_SESSION_REVOKED",
      "USER_INACTIVE",
    ].includes(error.code)
  );
}

export function shouldRefreshAccessToken(error: unknown): boolean {
  return (
    error instanceof NativeApiError &&
    error.status === 401 &&
    error.code === "AUTH_TOKEN_EXPIRED"
  );
}

async function restoreByRefresh(
  options: RestoreSessionOptions,
  previous: NativeStoredSession,
): Promise<AuthSession> {
  try {
    const refreshed = await refreshStoredSession(options);
    return toAuthenticatedSession(refreshed.user);
  } catch (error) {
    if (isInvalidSessionError(error)) {
      await options.tokenStore.clearToken();
      return invalidAuthState(error);
    }
    if (isNetworkFailure(error) && previous.user) {
      return authState("AUTH_SESSION_OFFLINE", "offline", previous.user);
    }
    return authState("AUTH_RESTORE_FAILED", "error", null);
  }
}

async function refreshStoredSession(
  options: RestoreSessionOptions,
): Promise<NativeStoredSession> {
  const activeFlight = refreshFlights.get(options.tokenStore);
  if (activeFlight) {
    return activeFlight;
  }

  const flight = (async () => {
    const current = await requiredStoredSession(options.tokenStore);
    const refreshed = await refreshNativeSession(
      options.apiBaseUrl,
      current.refreshToken,
      { fetcher: options.fetcher },
    );
    return saveNativeSession(options.tokenStore, refreshed);
  })();
  refreshFlights.set(options.tokenStore, flight);
  try {
    return await flight;
  } finally {
    if (refreshFlights.get(options.tokenStore) === flight) {
      refreshFlights.delete(options.tokenStore);
    }
  }
}

async function requiredStoredSession(
  tokenStore: SecureTokenStore,
): Promise<NativeStoredSession> {
  const session = await tokenStore.getSession();
  if (!session) {
    throw new NativeApiError({
      code: "AUTH_SESSION_REVOKED",
      message: "Native session is not available.",
      status: 401,
    });
  }
  return session;
}

async function clearInvalidSession(
  tokenStore: SecureTokenStore,
  error: unknown,
): Promise<void> {
  if (isInvalidSessionError(error)) {
    await tokenStore.clearToken();
  }
}

function accessNeedsRefresh(session: NativeStoredSession): boolean {
  return Date.parse(session.accessExpiresAt) <= Date.now() + accessRefreshWindowMs;
}

function accessIsExpired(session: NativeStoredSession): boolean {
  return Date.parse(session.accessExpiresAt) <= Date.now();
}

function isNetworkFailure(error: unknown): boolean {
  return !(error instanceof NativeApiError);
}

function invalidAuthState(error: unknown): AuthSession {
  if (error instanceof NativeApiError && error.code === "USER_INACTIVE") {
    return authState("USER_INACTIVE", "session_expired", null);
  }
  return authState("AUTH_SESSION_REVOKED", "session_expired", null);
}

function authState(
  code: AuthMessageCode,
  status: AuthStatus,
  user: AuthUser | null,
): AuthSession {
  return { code, message: code, status, user };
}
