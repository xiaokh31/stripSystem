import { getCurrentUser, login } from "../api/auth-client";
import { NativeApiError } from "../api/api-error";
import type { AuthUser, AuthStatus } from "./auth-types";
import { canUseMobileScan } from "./mobile-permissions";
import type { SecureTokenStore } from "./token-store";

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
  const token = await options.tokenStore.getToken();
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
  credentials: LoginCredentials,
  tokenStore: SecureTokenStore,
  options: { fetcher?: typeof fetch } = {},
): Promise<AuthSession> {
  const result = await login(apiBaseUrl, credentials, {
    fetcher: options.fetcher,
  });
  await tokenStore.setToken(result.accessToken);
  return toAuthenticatedSession(result.user);
}

export async function signOut(tokenStore: SecureTokenStore): Promise<AuthSession> {
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
