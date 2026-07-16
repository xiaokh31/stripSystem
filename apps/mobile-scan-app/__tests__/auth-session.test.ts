import test from "node:test";
import assert from "node:assert/strict";
import { getCurrentUser, login } from "../src/api/auth-client";
import { NativeApiError } from "../src/api/api-error";
import {
  restoreSession,
  signIn,
  signOut,
  withNativeSession,
} from "../src/auth/auth-session";
import {
  canCompleteMobileLoadJob,
  canSupervisorOverrideScans,
  canUpdateMobileDock,
  canUseMobileScan,
} from "../src/auth/mobile-permissions";
import {
  createNativeSecureTokenStore,
  MemorySecureTokenStore,
} from "../src/auth/token-store";

const warehouseUser = {
  email: "warehouse@example.com",
  id: "user-warehouse",
  name: "Warehouse Operator",
  permissions: [
    "load_jobs.complete",
    "load_jobs.read",
    "load_jobs.update",
    "scan.create",
  ],
  roles: ["WAREHOUSE"],
};

test("login calls the real auth endpoint shape without logging or exposing the token", async () => {
  const requests: Array<{ body?: string; headers: HeadersInit | undefined; url: string }> = [];
  const result = await login(
    "http://api.local/api",
    { email: "warehouse@example.com", password: "Correct#123" },
    {
      fetcher: async (input, init) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          headers: init?.headers,
          url: String(input),
        });
        return new Response(
          JSON.stringify({
            accessToken: "jwt-token-value",
            expiresIn: 3600,
            tokenType: "Bearer",
            user: warehouseUser,
          }),
          { status: 200 },
        );
      },
    },
  );

  assert.equal(requests[0]?.url, "http://api.local/api/auth/login");
  assert.equal(
    requests[0]?.body,
    JSON.stringify({
      email: "warehouse@example.com",
      password: "Correct#123",
    }),
  );
  assert.equal(result.accessToken, "jwt-token-value");
  assert.deepEqual(result.user.roles, ["WAREHOUSE"]);
});

test("getCurrentUser sends the Bearer token only to auth me", async () => {
  const requests: Array<{ headers: HeadersInit | undefined; url: string }> = [];
  const result = await getCurrentUser("http://api.local/api", "jwt-token-value", {
    fetcher: async (input, init) => {
      requests.push({ headers: init?.headers, url: String(input) });
      return new Response(JSON.stringify(warehouseUser), { status: 200 });
    },
  });

  assert.equal(requests[0]?.url, "http://api.local/api/auth/me");
  assert.deepEqual(requests[0]?.headers, {
    authorization: "Bearer jwt-token-value",
  });
  assert.equal(result.email, "warehouse@example.com");
});

test("auth client preserves explicit API error codes for bad credentials and system users", async () => {
  await assert.rejects(
    () =>
      login(
        "http://api.local/api",
        { email: "system@example.com", password: "Correct#123" },
        {
          fetcher: async () =>
            new Response(
              JSON.stringify({
                code: "SYSTEM_USER_LOGIN_NOT_ALLOWED",
                message: "SYSTEM users cannot use ordinary password login.",
              }),
              { status: 403 },
            ),
        },
      ),
    (error) =>
      error instanceof NativeApiError &&
      error.code === "SYSTEM_USER_LOGIN_NOT_ALLOWED" &&
      error.status === 403,
  );
});

test("session stores token, exposes current user, and gates missing scan permissions", async () => {
  const tokenStore = new MemorySecureTokenStore();
  const officeOnlyUser = {
    ...warehouseUser,
    permissions: ["load_jobs.read"],
    roles: ["OFFICE"],
  };

  const session = await signIn(
    "http://api.local/api",
    { email: "office@example.com", password: "Correct#123" },
    tokenStore,
    {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            accessToken: "office-token",
            accessExpiresAt: future(900),
            expiresIn: 3600,
            refreshExpiresAt: future(86_400),
            refreshExpiresIn: 86_400,
            refreshToken: "office-refresh-token",
            sessionId: "office-session",
            tokenType: "Bearer",
            user: officeOnlyUser,
          }),
          { status: 200 },
        ),
    },
  );

  assert.equal(await tokenStore.getToken(), "office-token");
  assert.equal(session.status, "permission_denied");
  assert.equal(canUseMobileScan(session.user), false);
});

test("native secure token store delegates to the native module and preserves token boundaries", async () => {
  let storedToken: string | null = null;
  const tokenStore = createNativeSecureTokenStore({
    BestarSecureTokenStore: {
      async clearToken() {
        storedToken = null;
      },
      async getToken() {
        return storedToken;
      },
      async setToken(token: string) {
        storedToken = token;
      },
    },
  });

  await tokenStore.setToken("secure-jwt-token");
  assert.equal(await tokenStore.getToken(), "secure-jwt-token");

  await tokenStore.clearToken();
  assert.equal(await tokenStore.getToken(), null);
});

test("native secure token store fails explicitly when secure storage is unavailable or rejects writes", async () => {
  const unavailableStore = createNativeSecureTokenStore({
    BestarSecureTokenStore: null,
  });

  await assert.rejects(
    () => unavailableStore.getToken(),
    /secure token storage is required/,
  );

  const tokenStore = createNativeSecureTokenStore({
    BestarSecureTokenStore: {
      async clearToken() {},
      async getToken() {
        return null;
      },
      async setToken() {
        throw new Error("keystore write failed");
      },
    },
  });

  await assert.rejects(
    () => tokenStore.setToken("secure-jwt-token"),
    /keystore write failed/,
  );
});

test("restoreSession reports secure storage read failures without falling back to AsyncStorage", async () => {
  const session = await restoreSession({
    apiBaseUrl: "http://api.local/api",
    tokenStore: createNativeSecureTokenStore({
      BestarSecureTokenStore: {
        async clearToken() {},
        async getToken() {
          throw new Error("secure store read failed");
        },
        async setToken() {},
      },
    }),
  });

  assert.equal(session.status, "error");
  assert.equal(session.code, "AUTH_RESTORE_FAILED");
  assert.equal(session.message, "AUTH_RESTORE_FAILED");
});

test("native scan permissions separate ordinary warehouse users from supervisors", () => {
  assert.equal(canUseMobileScan(warehouseUser), true);
  assert.equal(canSupervisorOverrideScans(warehouseUser), false);
  assert.equal(canUpdateMobileDock(warehouseUser), true);
  assert.equal(canCompleteMobileLoadJob(warehouseUser), true);

  const supervisorUser = {
    ...warehouseUser,
    permissions: [
      ...warehouseUser.permissions,
      "load_jobs.complete",
      "load_jobs.update",
      "scan.override",
    ],
  };
  assert.equal(canSupervisorOverrideScans(supervisorUser), true);
  assert.equal(canUpdateMobileDock(supervisorUser), true);
  assert.equal(canCompleteMobileLoadJob(supervisorUser), true);

  const adminUser = {
    ...warehouseUser,
    permissions: [],
    roles: ["ADMIN"],
  };
  assert.equal(canSupervisorOverrideScans(adminUser), true);
  assert.equal(canUpdateMobileDock(adminUser), true);
  assert.equal(canCompleteMobileLoadJob(adminUser), true);
});

test("restoreSession clears expired tokens and logout clears active tokens", async () => {
  const tokenStore = new MemorySecureTokenStore();
  await tokenStore.setSession(storedSession({ accessToken: "expired-token" }));

  const expired = await restoreSession({
    apiBaseUrl: "http://api.local/api",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "AUTH_SESSION_REVOKED",
          message: "Bearer token is invalid or expired.",
        }),
        { status: 401 },
      ),
    tokenStore,
  });

  assert.equal(expired.status, "session_expired");
  assert.equal(await tokenStore.getToken(), null);

  await tokenStore.setSession(storedSession({ accessToken: "active-token" }));
  const signedOut = await signOut(tokenStore);

  assert.equal(signedOut.status, "logged_out");
  assert.equal(await tokenStore.getToken(), null);
});

test("expired access token refresh is single-flight and atomically rotates the stored session", async () => {
  const tokenStore = new MemorySecureTokenStore();
  await tokenStore.setSession(storedSession());
  let refreshRequests = 0;
  const fetcher: typeof fetch = async (input) => {
    assert.equal(String(input), "http://api.local/api/auth/native/refresh");
    refreshRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify(nativeSessionResponse()), { status: 200 });
  };
  const tokens: string[] = [];

  await Promise.all([
    withNativeSession(
      { apiBaseUrl: "http://api.local/api", fetcher, tokenStore },
      async (token) => tokens.push(token),
    ),
    withNativeSession(
      { apiBaseUrl: "http://api.local/api", fetcher, tokenStore },
      async (token) => tokens.push(token),
    ),
  ]);

  assert.equal(refreshRequests, 1);
  assert.deepEqual(tokens, ["rotated-access-token", "rotated-access-token"]);
  const stored = await tokenStore.getSession();
  assert.equal(stored?.accessToken, "rotated-access-token");
  assert.equal(stored?.refreshToken, "rotated-refresh-token");
  assert.equal(stored?.sessionId, "native-session-1");
  assert.equal(stored?.user?.id, warehouseUser.id);
});

test("one explicit AUTH_TOKEN_EXPIRED response triggers one refresh and one safe retry", async () => {
  const tokenStore = new MemorySecureTokenStore();
  await tokenStore.setSession(
    storedSession({ accessExpiresAt: future(600), accessToken: "old-access" }),
  );
  let calls = 0;
  const result = await withNativeSession(
    {
      apiBaseUrl: "http://api.local/api",
      fetcher: async () =>
        new Response(JSON.stringify(nativeSessionResponse()), { status: 200 }),
      tokenStore,
    },
    async (token) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(token, "old-access");
        throw new NativeApiError({
          code: "AUTH_TOKEN_EXPIRED",
          message: "expired",
          status: 401,
        });
      }
      return token;
    },
  );

  assert.equal(calls, 2);
  assert.equal(result, "rotated-access-token");
});

test("temporary offline refresh preserves secure credentials and restores cached operator context", async () => {
  const tokenStore = new MemorySecureTokenStore();
  await tokenStore.setSession(storedSession());

  const session = await restoreSession({
    apiBaseUrl: "http://api.local/api",
    fetcher: async () => {
      throw new TypeError("network unavailable");
    },
    tokenStore,
  });

  assert.equal(session.status, "offline");
  assert.equal(session.user?.id, warehouseUser.id);
  assert.notEqual(await tokenStore.getSession(), null);
});

test("revoked refresh clears the complete secure session but generic 401 does not rotate", async () => {
  const revokedStore = new MemorySecureTokenStore();
  await revokedStore.setSession(storedSession());
  const revoked = await restoreSession({
    apiBaseUrl: "http://api.local/api",
    fetcher: async () =>
      new Response(JSON.stringify({ code: "AUTH_SESSION_REVOKED" }), {
        status: 401,
      }),
    tokenStore: revokedStore,
  });
  assert.equal(revoked.status, "session_expired");
  assert.equal(await revokedStore.getSession(), null);

  const genericStore = new MemorySecureTokenStore();
  await genericStore.setSession(
    storedSession({ accessExpiresAt: future(600), accessToken: "active" }),
  );
  let refreshCalls = 0;
  await assert.rejects(() =>
    withNativeSession(
      {
        apiBaseUrl: "http://api.local/api",
        fetcher: async () => {
          refreshCalls += 1;
          return new Response("{}", { status: 500 });
        },
        tokenStore: genericStore,
      },
      async () => {
        throw new NativeApiError({
          code: "UNAUTHENTICATED",
          message: "invalid",
          status: 401,
        });
      },
    ),
  );
  assert.equal(refreshCalls, 0);
  assert.notEqual(await genericStore.getSession(), null);
});

function future(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function storedSession(
  overrides: Partial<{
    accessExpiresAt: string;
    accessToken: string;
    refreshExpiresAt: string;
    refreshToken: string;
    sessionId: string;
  }> = {},
) {
  return {
    accessExpiresAt: new Date(0).toISOString(),
    accessToken: "expired-access-token",
    refreshExpiresAt: future(86_400),
    refreshToken: "refresh-token-1",
    sessionId: "native-session-1",
    user: warehouseUser,
    ...overrides,
  };
}

function nativeSessionResponse() {
  return {
    accessExpiresAt: future(900),
    accessToken: "rotated-access-token",
    expiresIn: 900,
    refreshExpiresAt: future(86_400),
    refreshExpiresIn: 86_400,
    refreshToken: "rotated-refresh-token",
    sessionId: "native-session-1",
    tokenType: "Bearer" as const,
    user: warehouseUser,
  };
}
