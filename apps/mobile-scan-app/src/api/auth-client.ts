import type { AuthUser, LoginRequest, LoginResponse, NativeLoginRequest, NativeSessionResponse } from "../auth/auth-types";
import { normalizeApiBaseUrl } from "../config/api-base-url";
import { toNativeApiError } from "./api-error";

export interface AuthClientOptions {
  fetcher?: typeof fetch;
}

export async function nativeLogin(apiBaseUrl: string, body: NativeLoginRequest, options: AuthClientOptions = {}): Promise<NativeSessionResponse> {
  const response = await request(apiBaseUrl, "/auth/native/login", { body: JSON.stringify(body), fetcher: options.fetcher, headers: { "content-type": "application/json" }, method: "POST" });
  return (await response.json()) as NativeSessionResponse;
}

export async function refreshNativeSession(apiBaseUrl: string, refreshToken: string, options: AuthClientOptions = {}): Promise<NativeSessionResponse> {
  const response = await request(apiBaseUrl, "/auth/native/refresh", { body: JSON.stringify({ refreshToken }), fetcher: options.fetcher, headers: { "content-type": "application/json" }, method: "POST" });
  return (await response.json()) as NativeSessionResponse;
}

export async function revokeNativeSession(apiBaseUrl: string, refreshToken: string, options: AuthClientOptions = {}): Promise<void> {
  await request(apiBaseUrl, "/auth/native/logout", { body: JSON.stringify({ refreshToken }), fetcher: options.fetcher, headers: { "content-type": "application/json" }, method: "POST" });
}

export async function login(
  apiBaseUrl: string,
  body: LoginRequest,
  options: AuthClientOptions = {},
): Promise<LoginResponse> {
  const response = await request(apiBaseUrl, "/auth/login", {
    body: JSON.stringify(body),
    fetcher: options.fetcher,
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  return (await response.json()) as LoginResponse;
}

export async function getCurrentUser(
  apiBaseUrl: string,
  token: string,
  options: AuthClientOptions = {},
): Promise<AuthUser> {
  const response = await request(apiBaseUrl, "/auth/me", {
    fetcher: options.fetcher,
    headers: {
      authorization: `Bearer ${token}`,
    },
    method: "GET",
  });
  return (await response.json()) as AuthUser;
}

async function request(
  apiBaseUrl: string,
  path: string,
  options: RequestInit & AuthClientOptions,
): Promise<Response> {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  if (!normalized.ok) {
    throw new Error(normalized.message);
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${normalized.value}${path}`, {
    body: options.body,
    headers: options.headers,
    method: options.method,
  });
  if (!response.ok) {
    throw await toNativeApiError(response);
  }

  return response;
}
