import test from "node:test";
import assert from "node:assert/strict";
import {
  createApiClient,
  getCurrentUser,
  getGeneratedFileDownloadUrl,
  login,
} from "../src/lib/api-client";
import {
  BROWSER_CSRF_COOKIE_NAME,
  getAuthTokenExpiryEpochSeconds,
  isBrowserAuthTokenExpired,
  safeAuthRedirectTarget,
} from "../src/lib/auth-token";

test("auth API client posts login credentials and reads current user", async () => {
  const requests: Array<{ body: unknown; method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
      method: init?.method ?? "GET",
      url,
    });

    if (url.endsWith("/auth/login")) {
      return jsonResponse({
        accessExpiresAt: "2026-07-23T00:15:00.000Z",
        expiresIn: 900,
        sessionExpiresAt: "2027-08-27T00:00:00.000Z",
        user: {
          id: "user-1",
          email: "office@example.com",
          name: "Office User",
          permissions: ["imports.read"],
          roles: ["OFFICE"],
        },
      });
    }

    return jsonResponse({
      id: "user-1",
      email: "office@example.com",
      name: "Office User",
      permissions: ["imports.read"],
      roles: ["OFFICE"],
    });
  };

  const loginResult = await login(
    { email: "office@example.com", password: "Correct#123" },
    { baseUrl: "http://api.local/api", fetcher },
  );
  const user = await getCurrentUser({
    authToken: "native-access-token",
    baseUrl: "http://api.local/api",
    fetcher,
  });

  assert.equal(loginResult.user.roles[0], "OFFICE");
  assert.equal(user.email, "office@example.com");
  assert.deepEqual(requests, [
    {
      body: { email: "office@example.com", password: "Correct#123" },
      method: "POST",
      url: "http://api.local/api/auth/login",
    },
    {
      body: null,
      method: "GET",
      url: "http://api.local/api/auth/me",
    },
  ]);
});

test("browser requests use credentials and CSRF without a JavaScript bearer", async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ authorization: string | null; csrf: string | null; credentials?: RequestCredentials }> = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      authorization: headers.get("Authorization"),
      csrf: headers.get("X-CSRF-Token"),
      credentials: init?.credentials,
    });
    return jsonResponse({ ok: true });
  };
  const fakeDocument = { cookie: `${BROWSER_CSRF_COOKIE_NAME}=csrf-value` };

  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDocument,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { fetch },
    });

    await createApiClient({ baseUrl: "/api", fetcher }).get("/imports");
    await createApiClient({ baseUrl: "/api", fetcher }).post("/imports", {
      value: true,
    });

    assert.deepEqual(requests, [
      { authorization: null, csrf: null, credentials: "include" },
      { authorization: null, csrf: "csrf-value", credentials: "include" },
    ]);
  } finally {
    if (documentDescriptor) {
      Object.defineProperty(globalThis, "document", documentDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).document;
    }
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  }
});

test("concurrent browser 401s share one refresh and retry each mutation once", async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fakeDocument = { cookie: `${BROWSER_CSRF_COOKIE_NAME}=csrf-before` };
  let refreshCalls = 0;
  const mutationCalls = new Map<string, number>();
  const mutationCsrf: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/auth/browser/refresh")) {
      refreshCalls += 1;
      await Promise.resolve();
      fakeDocument.cookie = `${BROWSER_CSRF_COOKIE_NAME}=csrf-after`;
      return jsonResponse({
        accessExpiresAt: "2026-07-23T00:15:00.000Z",
        expiresIn: 900,
        sessionExpiresAt: "2027-08-27T00:00:00.000Z",
        user: {
          email: "office@example.com",
          id: "user-1",
          name: "Office User",
          permissions: [],
          roles: ["OFFICE"],
        },
      });
    }
    const count = (mutationCalls.get(url) ?? 0) + 1;
    mutationCalls.set(url, count);
    mutationCsrf.push(new Headers(init?.headers).get("X-CSRF-Token") ?? "");
    return count === 1
      ? jsonResponse({ code: "UNAUTHENTICATED" }, 401)
      : jsonResponse({ ok: true });
  };

  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDocument,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { fetch },
    });
    const client = createApiClient({ baseUrl: "/api", fetcher });
    await Promise.all([
      client.post("/mutation/a", { value: "a" }),
      client.post("/mutation/b", { value: "b" }),
    ]);

    assert.equal(refreshCalls, 1);
    assert.deepEqual([...mutationCalls.values()], [2, 2]);
    assert.deepEqual(mutationCsrf, [
      "csrf-before",
      "csrf-before",
      "csrf-after",
      "csrf-after",
    ]);
  } finally {
    if (documentDescriptor) {
      Object.defineProperty(globalThis, "document", documentDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).document;
    }
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  }
});

test("browser auth token helpers read JWT expiry for middleware redirects", () => {
  const validToken = unsignedJwt({ exp: 1_800 });
  const expiredToken = unsignedJwt({ exp: 1_000 });

  assert.equal(getAuthTokenExpiryEpochSeconds(validToken), 1_800);
  assert.equal(isBrowserAuthTokenExpired(validToken, 1_200), false);
  assert.equal(isBrowserAuthTokenExpired(expiredToken, 1_200), true);
  assert.equal(isBrowserAuthTokenExpired("not-a-jwt", 1_200), true);
});

test("auth redirect targets stay inside the web app", () => {
  assert.equal(safeAuthRedirectTarget("/imports/123"), "/imports/123");
  assert.equal(safeAuthRedirectTarget("https://bad.example"), "/");
  assert.equal(safeAuthRedirectTarget("//bad.example"), "/");
  assert.equal(safeAuthRedirectTarget("/api/health"), "/");
  assert.equal(safeAuthRedirectTarget(null), "/");
});

test("generated file download links stay on the browser web path", () => {
  assert.equal(
    getGeneratedFileDownloadUrl("container 1", "file 2", "/api"),
    "/containers/container%201/files/file%202/download",
  );
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function unsignedJwt(payload: Record<string, unknown>): string {
  return [
    base64UrlEncode({ alg: "none", typ: "JWT" }),
    base64UrlEncode(payload),
    "signature",
  ].join(".");
}

function base64UrlEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
