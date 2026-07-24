import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_BASE_URL } from "./helpers";

test("admin can sign in through the browser login page", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "中文" })).toBeVisible();

  await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(E2E_ADMIN_PASSWORD);
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await loginResponsePromise;
  const loginBody = (await loginResponse.json()) as Record<string, unknown>;
  expect(loginBody).not.toHaveProperty("accessToken");
  expect(loginBody).not.toHaveProperty("refreshToken");

  await expect(page).toHaveURL("/");
  const cookies = await page.context().cookies();
  const accessCookie = cookies.find((cookie) => cookie.name === "bestar_access");
  const refreshCookie = cookies.find((cookie) => cookie.name === "bestar_refresh");
  const csrfCookie = cookies.find((cookie) => cookie.name === "bestar_csrf");
  const sessionHint = cookies.find((cookie) => cookie.name === "bestar_session");
  expect(accessCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  expect(refreshCookie).toMatchObject({
    httpOnly: true,
    path: "/api/auth/browser",
    sameSite: "Lax",
  });
  expect(refreshCookie?.expires).toBeGreaterThan(
    Math.floor(Date.now() / 1000) + 300 * 24 * 60 * 60,
  );
  expect(csrfCookie).toMatchObject({ httpOnly: false, path: "/" });
  expect(sessionHint).toMatchObject({ httpOnly: true, path: "/" });
  expect(cookies.find((cookie) => cookie.name === "bestar_auth_token")).toBeUndefined();
  await expect(
    page.getByRole("heading", { name: "Operations dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Dashboard").first()).toBeVisible();

  await page.context().clearCookies({ name: "bestar_access" });
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Operations dashboard" }),
  ).toBeVisible();

  const csrfRejected = await page.evaluate(async () => {
    const response = await fetch("/api/auth/browser/logout", {
      credentials: "include",
      method: "POST",
    });
    return {
      body: (await response.json()) as { code?: string },
      status: response.status,
    };
  });
  expect(csrfRejected).toMatchObject({
    body: { code: "CSRF_REJECTED" },
    status: 403,
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  const loggedOutCookies = await page.context().cookies();
  expect(
    loggedOutCookies.some((cookie) =>
      ["bestar_access", "bestar_refresh", "bestar_csrf", "bestar_session"].includes(
        cookie.name,
      ),
    ),
  ).toBe(false);
});

test("repeated invalid browser logins are rate limited without account disclosure", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_SKIP_RATE_LIMIT === "true",
    "The full browser matrix uses an elevated local-only limiter and runs this case separately.",
  );
  const email = `missing-${Date.now()}@invalid.local`;
  const responses = [];
  for (let attempt = 0; attempt < 11; attempt += 1) {
    responses.push(
      await page.context().request.post("/api/auth/login", {
        data: { email, password: "Invalid-E2E-Password-123!" },
        headers: { Origin: new URL(E2E_BASE_URL).origin },
      }),
    );
  }
  expect(responses.slice(0, 10).every((response) => response.status() === 401)).toBe(true);
  expect(responses[10]?.status()).toBe(429);
  expect(await responses[10]?.json()).toMatchObject({ code: "AUTH_RATE_LIMITED" });
});
