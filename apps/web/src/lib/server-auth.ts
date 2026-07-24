import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  ApiClientError,
  getCurrentUser,
  type ApiClientOptions,
  type AuthUserResponse,
} from "@/lib/api-client";
import {
  AUTH_TOKEN_COOKIE_NAME,
  BROWSER_ACCESS_COOKIE_NAME,
} from "@/lib/auth-token";

export async function getServerAuthToken(): Promise<string | null> {
  if (process.env.PUBLIC_DEPLOYMENT_ENABLED === "true") return null;
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_TOKEN_COOKIE_NAME)?.value ?? null;
}

export function getRequestApiAuthHeaders(request: NextRequest): Headers | null {
  const browserAccess = request.cookies.get(BROWSER_ACCESS_COOKIE_NAME)?.value;
  if (browserAccess) {
    return new Headers({
      Cookie: `${BROWSER_ACCESS_COOKIE_NAME}=${encodeURIComponent(browserAccess)}`,
    });
  }
  if (process.env.PUBLIC_DEPLOYMENT_ENABLED === "true") return null;
  const legacy = request.cookies.get(AUTH_TOKEN_COOKIE_NAME)?.value;
  return legacy ? new Headers({ Authorization: `Bearer ${legacy}` }) : null;
}

export async function getServerApiOptions(): Promise<ApiClientOptions> {
  const cookieStore = await cookies();
  const browserAccess = cookieStore.get(BROWSER_ACCESS_COOKIE_NAME)?.value;
  const legacy =
    process.env.PUBLIC_DEPLOYMENT_ENABLED === "true"
      ? undefined
      : cookieStore.get(AUTH_TOKEN_COOKIE_NAME)?.value;
  return {
    authToken: browserAccess ? null : legacy ?? null,
    cookieHeader: browserAccess
      ? `${BROWSER_ACCESS_COOKIE_NAME}=${encodeURIComponent(browserAccess)}`
      : undefined,
  };
}

export async function getServerCurrentUser(): Promise<AuthUserResponse | null> {
  const options = await getServerApiOptions();
  if (!options.authToken && !options.cookieHeader) {
    return null;
  }

  try {
    return await getCurrentUser(options);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }
    return null;
  }
}
