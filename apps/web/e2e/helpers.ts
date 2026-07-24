import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

export const E2E_ADMIN_EMAIL = readRequiredEnv("E2E_ADMIN_EMAIL");
export const E2E_ADMIN_PASSWORD = readRequiredEnv("E2E_ADMIN_PASSWORD");
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1";

const credentialsByAccessToken = new Map<string, E2ECredentials>();
const browserAuthCookieNames = [
  "bestar_access",
  "bestar_refresh",
  "bestar_csrf",
  "bestar_session",
  "bestar_auth_token",
] as const;

export interface E2ECredentials {
  email: string;
  password: string;
}

export interface E2ETestUser extends E2ECredentials {
  id: string;
  name: string;
  roleCodes: string[];
}

export async function loginThroughApi(
  page: Page,
  request: APIRequestContext,
): Promise<string> {
  return loginWithCredentials(page, request, {
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
  });
}

export async function loginWithCredentials(
  page: Page,
  request: APIRequestContext,
  credentials: E2ECredentials,
): Promise<string> {
  const accessToken = await loginForAccessToken(request, credentials);
  await establishBrowserSession(page.context(), credentials);
  return accessToken;
}

export async function configureBrowserActor(
  context: BrowserContext,
  accessToken: string | null,
): Promise<void> {
  for (const name of browserAuthCookieNames) {
    await context.clearCookies({ name });
  }
  if (!accessToken) return;
  const credentials = credentialsByAccessToken.get(accessToken);
  expect(credentials, "Browser actor credentials were not registered by the E2E login helper.").toBeDefined();
  await establishBrowserSession(context, credentials!);
}

async function establishBrowserSession(
  context: BrowserContext,
  credentials: E2ECredentials,
): Promise<void> {
  const browserLogin = await context.request.post("/api/auth/login", {
    data: {
      email: credentials.email,
      password: credentials.password,
    },
    headers: { Origin: new URL(E2E_BASE_URL).origin },
  });
  expect(browserLogin.status()).toBe(201);
  const browserBody = (await browserLogin.json()) as Record<string, unknown>;
  expect(browserBody).not.toHaveProperty("accessToken");
  expect(browserBody).not.toHaveProperty("refreshToken");
}

export async function loginForAccessToken(
  request: APIRequestContext,
  credentials: E2ECredentials,
): Promise<string> {
  const response = await request.post("/api/auth/native/login", {
    data: {
      appVersion: "e2e",
      deviceId: `playwright-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      email: credentials.email,
      password: credentials.password,
      platform: "playwright",
    },
  });

  expect(
    response.ok(),
    `E2E login failed for ${credentials.email}. Seed the user or prepare it through ensureTestUser.`,
  ).toBe(true);

  const body = (await response.json()) as {
    accessToken: string;
    expiresIn: number;
  };
  credentialsByAccessToken.set(body.accessToken, {
    email: credentials.email,
    password: credentials.password,
  });
  return body.accessToken;
}

export async function ensureTestUser(
  request: APIRequestContext,
  adminToken: string,
  input: {
    email: string;
    name: string;
    password: string;
    roleCodes: string[];
  },
): Promise<E2ETestUser> {
  const email = input.email.trim().toLowerCase();
  const headers = authHeaders(adminToken);
  const listResponse = await request.get("/api/users", { headers });
  expect(listResponse.status()).toBe(200);
  const listBody = (await listResponse.json()) as {
    items: UserResponse[];
  };
  const existing = listBody.items.find((item) => item.email === email);

  if (!existing) {
    const createResponse = await request.post("/api/users", {
      data: {
        email,
        name: input.name,
        password: input.password,
        roleCodes: input.roleCodes,
      },
      headers,
    });
    expect(createResponse.status()).toBe(201);
    const body = (await createResponse.json()) as { user: UserResponse };
    return toTestUser(body.user, input.password);
  }

  if (existing.name !== input.name) {
    const updateResponse = await request.patch(`/api/users/${existing.id}`, {
      data: { name: input.name },
      headers,
    });
    expect(updateResponse.status()).toBe(200);
  }

  if (!sameStringSet(existing.roles.map((role) => role.code), input.roleCodes)) {
    const rolesResponse = await request.patch(`/api/users/${existing.id}/roles`, {
      data: { roleCodes: input.roleCodes },
      headers,
    });
    expect(rolesResponse.status()).toBe(200);
  }

  if (!existing.isActive) {
    const statusResponse = await request.patch(
      `/api/users/${existing.id}/status`,
      {
        data: { isActive: true },
        headers,
      },
    );
    expect(statusResponse.status()).toBe(200);
  }

  const resetResponse = await request.post(
    `/api/users/${existing.id}/reset-password`,
    {
      data: { password: input.password },
      headers,
    },
  );
  expect(resetResponse.status()).toBe(201);
  const body = (await resetResponse.json()) as { user: UserResponse };
  return toTestUser(body.user, input.password);
}

export async function expectNoPageError(page: Page): Promise<void> {
  await expect(page.getByText("Page error")).toHaveCount(0);
  await expect(page.getByText("Settings could not be loaded")).toHaveCount(0);
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for browser E2E tests.`);
  }
  return value;
}

function sameStringSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left.map((item) => item.trim().toUpperCase()));
  const rightSet = new Set(right.map((item) => item.trim().toUpperCase()));
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  return [...leftSet].every((item) => rightSet.has(item));
}

function toTestUser(user: UserResponse, password: string): E2ETestUser {
  return {
    email: user.email,
    id: user.id,
    name: user.name ?? user.email,
    password,
    roleCodes: user.roles.map((role) => role.code),
  };
}

interface UserResponse {
  email: string;
  id: string;
  isActive: boolean;
  name: string | null;
  roles: Array<{ code: string }>;
}
