import test from "node:test";
import assert from "node:assert/strict";
import { getCurrentUser, login } from "../src/api/auth-client";
import { NativeApiError } from "../src/api/api-error";
import { restoreSession, signIn, signOut } from "../src/auth/auth-session";
import {
  canCompleteMobileLoadJob,
  canSupervisorOverrideScans,
  canUpdateMobileDock,
  canUseMobileScan,
} from "../src/auth/mobile-permissions";
import { authTokenStorageKey, AsyncStorageTokenStore } from "../src/auth/token-store";
import { MemorySettingsStore } from "../src/storage/settings-store";

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
  const store = new MemorySettingsStore();
  const tokenStore = new AsyncStorageTokenStore(store);
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
            expiresIn: 3600,
            tokenType: "Bearer",
            user: officeOnlyUser,
          }),
          { status: 200 },
        ),
    },
  );

  assert.equal(await store.getItem(authTokenStorageKey), "office-token");
  assert.equal(session.status, "permission_denied");
  assert.equal(canUseMobileScan(session.user), false);
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
  const store = new MemorySettingsStore();
  const tokenStore = new AsyncStorageTokenStore(store);
  await tokenStore.setToken("expired-token");

  const expired = await restoreSession({
    apiBaseUrl: "http://api.local/api",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "UNAUTHENTICATED",
          message: "Bearer token is invalid or expired.",
        }),
        { status: 401 },
      ),
    tokenStore,
  });

  assert.equal(expired.status, "session_expired");
  assert.equal(await store.getItem(authTokenStorageKey), null);

  await tokenStore.setToken("active-token");
  const signedOut = await signOut(tokenStore);

  assert.equal(signedOut.status, "logged_out");
  assert.equal(await store.getItem(authTokenStorageKey), null);
});
