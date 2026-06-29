import { cookies } from "next/headers";
import {
  ApiClientError,
  getCurrentUser,
  type ApiClientOptions,
  type AuthUserResponse,
} from "@/lib/api-client";
import { AUTH_TOKEN_COOKIE_NAME } from "@/lib/auth-token";

export async function getServerAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_TOKEN_COOKIE_NAME)?.value ?? null;
}

export async function getServerApiOptions(): Promise<ApiClientOptions> {
  return { authToken: await getServerAuthToken() };
}

export async function getServerCurrentUser(): Promise<AuthUserResponse | null> {
  const authToken = await getServerAuthToken();
  if (!authToken) {
    return null;
  }

  try {
    return await getCurrentUser({ authToken });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }
    return null;
  }
}
