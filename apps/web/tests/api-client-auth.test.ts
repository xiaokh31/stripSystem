import test from "node:test";
import assert from "node:assert/strict";
import {
  createApiClient,
  getCurrentUser,
  getGeneratedFileDownloadUrl,
  login,
} from "../src/lib/api-client";
import {
  AUTH_TOKEN_COOKIE_NAME,
  clearBrowserAuthToken,
  getAuthTokenExpiryEpochSeconds,
  isBrowserAuthTokenExpired,
  safeAuthRedirectTarget,
  setBrowserAuthToken,
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
        accessToken: "token-1",
        expiresIn: 900,
        tokenType: "Bearer",
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
    authToken: loginResult.accessToken,
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

test("browser auth token cookie is the default API authorization source", async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const requestHeaders: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    requestHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
    return jsonResponse({ ok: true });
  };
  const fakeDocument = { cookie: "" };

  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDocument,
    });

    setBrowserAuthToken("browser-token", 34_560_000);
    assert.match(fakeDocument.cookie, /Max-Age=34560000/);
    await createApiClient({ baseUrl: "/api", fetcher }).get("/imports");
    clearBrowserAuthToken();
    await createApiClient({ baseUrl: "/api", fetcher }).get("/imports");

    assert.deepEqual(requestHeaders, ["Bearer browser-token", ""]);
    assert.match(fakeDocument.cookie, new RegExp(`${AUTH_TOKEN_COOKIE_NAME}=`));
    assert.match(fakeDocument.cookie, /Max-Age=0/);
  } finally {
    if (documentDescriptor) {
      Object.defineProperty(globalThis, "document", documentDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).document;
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
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
